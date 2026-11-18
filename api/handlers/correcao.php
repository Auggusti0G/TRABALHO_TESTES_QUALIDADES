<?php
/** UC07 – Cadastrar Gabarito Oficial e Corrigir Provas (RF014 a RF017) – exclusivo do Supervisor de Seleção. */

function gabaritoTexto(array $questoes): string
{
    return implode(' ', array_map(fn($x) => $x['numero'] . ':' . ($x['anulada'] ? 'ANULADA' : ($x['gabarito'] ?: '-')), $questoes));
}

function acao_gabarito_obter(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    return ['prova' => $p, 'questoes' => $p['tipo'] === 'OBJETIVA' ? questoesDaProva((int)$p['id']) : []];
}

function acao_gabarito_salvar(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    if ($p['tipo'] !== 'OBJETIVA') {
        falha('Gabarito oficial aplica-se somente a provas objetivas.');
    }
    $recebido = is_array($in['gabarito'] ?? null) ? $in['gabarito'] : [];
    $questoes = questoesDaProva((int)$p['id']);
    $novo = [];
    foreach ($questoes as $qst) {
        $r = strtoupper(trim((string)($recebido[$qst['numero']] ?? '')));
        // E2 – gabarito oficial incompleto
        if ($r === '' && !$qst['anulada']) {
            falha('Gabarito oficial incompleto: informe todas as questões.');
        }
        if ($r !== '' && !in_array($r, ALTERNATIVAS, true)) {
            falha("Alternativa inválida na questão {$qst['numero']}. Use A, B, C, D ou E.");
        }
        $novo[$qst['id']] = $r ?: $qst['gabarito'];
    }
    $anterior = gabaritoTexto($questoes);
    transacao(function () use ($novo) {
        foreach ($novo as $qid => $letra) {
            q('UPDATE questoes SET gabarito = ? WHERE id = ?', [$letra, $qid]);
        }
    });
    // RNF003 – log de auditoria com valor anterior e novo
    auditar('GABARITO_OFICIAL', "Gabarito oficial da prova {$p['codigo']} ({$p['cargo']})", $anterior, gabaritoTexto(questoesDaProva((int)$p['id'])));
    return ['mensagem' => 'Gabarito oficial cadastrado com sucesso.',
        'detalhe' => count($questoes) . ' questões gravadas; log de auditoria registrado.'];
}

/** RF016 – notas finais (0 a 10) das provas discursiva e prática dos candidatos presentes. */
function acao_notas_listar(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    $lista = todos('SELECT c.inscricao, c.nome, a.situacao, a.nota
                    FROM candidatos c LEFT JOIN aplicacoes a ON a.candidato_id = c.id AND a.prova_id = ?
                    WHERE c.cargo_id = ? ORDER BY c.inscricao', [$p['id'], $p['cargo_id']]);
    return ['prova' => $p, 'candidatos' => $lista];
}

function acao_notas_salvar(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    if ($p['tipo'] === 'OBJETIVA') {
        falha('A nota da prova objetiva é calculada pela correção.');
    }
    $notas = is_array($in['notas'] ?? null) ? $in['notas'] : [];
    $n = transacao(function () use ($p, $notas) {
        $n = 0;
        foreach ($notas as $inscricao => $txt) {
            if (trim((string)$txt) === '') {
                continue;
            }
            $nota = numero((string)$txt);
            if ($nota === null || $nota < 0 || $nota > 10) {
                falha("Nota inválida para a inscrição $inscricao. Informe um valor de 0 a 10.");
            }
            $c = um('SELECT id FROM candidatos WHERE inscricao = ? AND cargo_id = ?', [(string)$inscricao, $p['cargo_id']])
                ?? falha('Inscrição não encontrada.');
            $ap = um('SELECT * FROM aplicacoes WHERE candidato_id = ? AND prova_id = ?', [$c['id'], $p['id']]);
            if ($ap && $ap['situacao'] === 'A') {
                falha("Candidato $inscricao ausente nesta prova: nota não permitida.");
            }
            if ($ap) {
                if ((string)$ap['nota'] !== '' && (float)$ap['nota'] !== $nota) {
                    auditar('NOTA_FINAL', "Nota da prova {$p['codigo']} – inscrição $inscricao", (string)$ap['nota'], (string)$nota);
                }
                atualizar('aplicacoes', ['nota' => $nota], (int)$ap['id']);
            } else {
                inserir('aplicacoes', ['candidato_id' => $c['id'], 'prova_id' => $p['id'], 'situacao' => 'P', 'nota' => $nota]);
            }
            $n++;
        }
        return $n;
    });
    return ['mensagem' => "Notas gravadas com sucesso: $n candidatos."];
}

function resumoCorrecao(int $concursoId): array
{
    $c = concursoOuFalha($concursoId);
    $provas = todos('SELECT p.codigo, p.tipo, p.peso, p.cargo_id FROM provas p JOIN cargos g ON g.id = p.cargo_id WHERE g.concurso_id = ? ORDER BY p.id', [$concursoId]);
    return ['correcao_em' => $c['correcao_em'], 'provas' => array_values(array_unique(array_column($provas, 'codigo'))),
        'candidatos' => quadroDeNotas($concursoId)];
}

function acao_correcao_resumo(array $in): array
{
    return resumoCorrecao((int)($in['concurso_id'] ?? 0));
}

function acao_correcao_executar(array $in): array
{
    $id = (int)($in['concurso_id'] ?? 0);
    $n = transacao(fn() => corrigirConcurso($id));
    auditar('CORRECAO', "Execução da correção do concurso #$id", null, "$n candidatos corrigidos");
    return ['mensagem' => "Correção concluída: $n candidatos corrigidos."] + resumoCorrecao($id);
}
