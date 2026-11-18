<?php
/** Regras de negócio centrais: correção, eliminação, classificação e liberação de documentos. */

const ALTERNATIVAS = ['A', 'B', 'C', 'D', 'E'];
const PONTOS_NOTA = 10.0; // provas discursiva e prática: nota final de 0 a 10

function concursoOuFalha(int $id): array
{
    return um('SELECT * FROM concursos WHERE id = ?', [$id]) ?? falha('Concurso não encontrado.', 404);
}

function provaOuFalha(int $id): array
{
    $p = um('SELECT p.*, c.nome AS cargo, c.concurso_id FROM provas p JOIN cargos c ON c.id = p.cargo_id WHERE p.id = ?', [$id]);
    return $p ?? falha('Prova não encontrada.', 404);
}

function provasDoCargo(int $cargoId): array
{
    return todos('SELECT * FROM provas WHERE cargo_id = ? ORDER BY id', [$cargoId]);
}

function questoesDaProva(int $provaId): array
{
    return todos('SELECT * FROM questoes WHERE prova_id = ? ORDER BY numero', [$provaId]);
}

function pontosPossiveis(array $prova, ?array $questoes = null): float
{
    if ($prova['tipo'] !== 'OBJETIVA') {
        return PONTOS_NOTA;
    }
    $questoes ??= questoesDaProva((int)$prova['id']);
    return array_sum(array_map(fn($x) => (float)$x['pontuacao'], $questoes));
}

/**
 * RF015/RF016/RF017 – corrige as provas de todos os candidatos do concurso.
 * Nota ponderada = Σ (pontos obtidos na prova × peso).
 * Eliminação por prova: pontos ÷ pontos possíveis < % mínimo da prova eliminatória.
 * Eliminação pelo conjunto: Σ pontos ÷ Σ pontos possíveis < % mínimo do concurso.
 * Retorna a quantidade de candidatos corrigidos.
 */
function corrigirConcurso(int $concursoId): int
{
    $conc = concursoOuFalha($concursoId);
    $corrigidos = 0;

    foreach (todos('SELECT * FROM cargos WHERE concurso_id = ?', [$concursoId]) as $cargo) {
        $provas = provasDoCargo((int)$cargo['id']);
        $questoes = [];
        foreach ($provas as $p) {
            if ($p['tipo'] !== 'OBJETIVA') {
                continue;
            }
            $questoes[$p['id']] = questoesDaProva((int)$p['id']);
            foreach ($questoes[$p['id']] as $qst) {
                if (!$qst['anulada'] && !$qst['gabarito']) {
                    falha("Gabarito oficial não cadastrado para a prova {$p['codigo']} do cargo {$cargo['nome']}.");
                }
            }
        }

        foreach (todos('SELECT id FROM candidatos WHERE cargo_id = ?', [$cargo['id']]) as $cand) {
            $pendente = false;
            $motivo = null;
            $obtidos = 0.0;
            $possiveis = 0.0;
            $nota = 0.0;

            foreach ($provas as $p) {
                $ap = um('SELECT * FROM aplicacoes WHERE candidato_id = ? AND prova_id = ?', [$cand['id'], $p['id']]);
                $max = pontosPossiveis($p, $questoes[$p['id']] ?? null);
                if (!$ap) {
                    $pendente = true;
                    continue;
                }
                if ($ap['situacao'] === 'A') {
                    $pts = 0.0;
                    $motivo ??= "Eliminado – ausente em {$p['codigo']}";
                } elseif ($p['tipo'] === 'OBJETIVA') {
                    $resp = json_decode($ap['respostas'] ?: '{}', true) ?: [];
                    $pts = 0.0;
                    foreach ($questoes[$p['id']] as $qst) {
                        // questão anulada: pontuação atribuída a todos os presentes
                        if ($qst['anulada'] || (($resp[$qst['numero']] ?? '') === $qst['gabarito'])) {
                            $pts += (float)$qst['pontuacao'];
                        }
                    }
                } else {
                    if ($ap['nota'] === null) {
                        $pendente = true;
                        continue;
                    }
                    $pts = (float)$ap['nota'];
                }
                q('UPDATE aplicacoes SET pontos = ? WHERE id = ?', [$pts, $ap['id']]);
                $obtidos += $pts;
                $possiveis += $max;
                $nota += $pts * (float)$p['peso'];

                if ($ap['situacao'] === 'P' && $p['carater'] === 'E' && $max > 0
                    && $pts * 100 < (float)$p['pct_min'] * $max - 1e-9) {
                    $motivo ??= "Eliminado – {$p['codigo']} abaixo de " . pctTexto((float)$p['pct_min']) . '%';
                }
            }

            if ($pendente || !$provas) {
                q('UPDATE candidatos SET situacao = ?, motivo = NULL, nota_final = NULL, pct_conjunto = NULL WHERE id = ?',
                    ['Pendente', $cand['id']]);
                continue;
            }
            $pct = $possiveis > 0 ? $obtidos / $possiveis * 100 : 0;
            if (!$motivo && $obtidos * 100 < (float)$conc['pct_min_conjunto'] * $possiveis - 1e-9) {
                $motivo = 'Eliminado – conjunto abaixo de ' . pctTexto((float)$conc['pct_min_conjunto']) . '%';
            }
            q('UPDATE candidatos SET situacao = ?, motivo = ?, nota_final = ?, pct_conjunto = ? WHERE id = ?',
                [$motivo ? 'Eliminado' : 'Não eliminado', $motivo, round($nota, 2), round($pct, 2), $cand['id']]);
            $corrigidos++;
        }
    }
    q('UPDATE concursos SET correcao_em = ? WHERE id = ?', [agora(), $concursoId]);
    return $corrigidos;
}

/** Notas por prova de cada candidato do concurso (para o resultado parcial e o painel de correção). */
function quadroDeNotas(int $concursoId, ?int $cargoId = null, ?int $localidadeId = null): array
{
    $sql = 'SELECT c.id, c.inscricao, c.nome, c.nascimento, c.pcd, c.situacao, c.motivo, c.nota_final, c.pct_conjunto,
                   c.cargo_id, c.localidade_id, g.nome AS cargo, l.municipio, l.uf
            FROM candidatos c JOIN cargos g ON g.id = c.cargo_id JOIN localidades l ON l.id = c.localidade_id
            WHERE c.concurso_id = ?';
    $par = [$concursoId];
    if ($cargoId) {
        $sql .= ' AND c.cargo_id = ?';
        $par[] = $cargoId;
    }
    if ($localidadeId) {
        $sql .= ' AND c.localidade_id = ?';
        $par[] = $localidadeId;
    }
    $cands = todos($sql . ' ORDER BY c.inscricao', $par);
    $aps = todos('SELECT a.candidato_id, a.situacao, a.pontos, p.codigo FROM aplicacoes a
                  JOIN provas p ON p.id = a.prova_id JOIN cargos g ON g.id = p.cargo_id WHERE g.concurso_id = ?', [$concursoId]);
    $mapa = [];
    foreach ($aps as $a) {
        $mapa[$a['candidato_id']][$a['codigo']] = $a['situacao'] === 'A' ? 'Ausente' : ($a['pontos'] === null ? null : (float)$a['pontos']);
    }
    foreach ($cands as &$c) {
        $c['notas'] = $mapa[$c['id']] ?? [];
    }
    return $cands;
}

/**
 * RF025/RF006 – classificação: nota ponderada, depois as provas na ordem de desempate
 * e, persistindo o empate, o candidato mais idoso.
 */
function classificar(int $concursoId, int $cargoId, int $localidadeId): array
{
    $desempate = array_column(
        todos('SELECT codigo FROM provas WHERE cargo_id = ? AND ordem_desempate IS NOT NULL ORDER BY ordem_desempate', [$cargoId]),
        'codigo'
    );
    $todos = quadroDeNotas($concursoId, $cargoId, $localidadeId);
    $aptos = array_values(array_filter($todos, fn($c) => $c['situacao'] === 'Não eliminado'));
    usort($aptos, function ($a, $b) use ($desempate) {
        if ((float)$a['nota_final'] !== (float)$b['nota_final']) {
            return (float)$b['nota_final'] <=> (float)$a['nota_final'];
        }
        foreach ($desempate as $cod) {
            $x = (float)($a['notas'][$cod] ?? 0);
            $y = (float)($b['notas'][$cod] ?? 0);
            if ($x !== $y) {
                return $y <=> $x;
            }
        }
        return [$a['nascimento'], $a['inscricao']] <=> [$b['nascimento'], $b['inscricao']];
    });
    foreach ($aptos as $i => &$c) {
        $c['posicao'] = $i + 1;
    }
    $eliminados = array_values(array_filter($todos, fn($c) => $c['situacao'] === 'Eliminado'));
    return ['classificados' => $aptos, 'eliminados' => $eliminados, 'desempate' => $desempate];
}

/* ---------- regras de liberação dos documentos do site ---------- */

/** RF020–RF022: 7 dias após o término das inscrições. */
function liberacaoDocumentos(array $concurso): string
{
    return somaDias($concurso['termino_inscricoes'], 7);
}

/** RF023: 1 dia após a data de realização da última prova. */
function liberacaoGabarito(int $concursoId): ?string
{
    $ultima = valor('SELECT MAX(p.data_realizacao) FROM provas p JOIN cargos c ON c.id = p.cargo_id WHERE c.concurso_id = ?', [$concursoId]);
    return $ultima ? somaDias(substr((string)$ultima, 0, 10), 1) : null;
}

function exigirLiberado(?string $data): void
{
    if ($data === null || hoje() < $data) {
        falha($data ? 'Documento disponível a partir de ' . dataBr($data) . '.' : 'Documento ainda não disponível.');
    }
}

/** RF008: cadastro de candidatos somente até 5 dias após o término das inscrições. */
function limiteCadastro(array $concurso): string
{
    return somaDias($concurso['termino_inscricoes'], 5);
}

function rotuloProva(array $p): string
{
    $tipos = ['OBJETIVA' => 'Objetiva', 'DISCURSIVA' => 'Discursiva', 'PRATICA' => 'Prática'];
    return "{$p['codigo']} – {$tipos[$p['tipo']]} – {$p['area']}";
}
