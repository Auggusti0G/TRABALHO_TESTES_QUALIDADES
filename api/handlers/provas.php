<?php
/** UC03 – Manter Provas, Questões e Critérios de Desempate (RF004, RF005, RF006). */

function provaDetalhada(array $p): array
{
    $p['rotulo'] = rotuloProva($p);
    $p['questoes'] = $p['tipo'] === 'OBJETIVA' ? (int)valor('SELECT COUNT(*) FROM questoes WHERE prova_id = ?', [$p['id']]) : 0;
    $p['pontos_possiveis'] = pontosPossiveis($p);
    return $p;
}

/** Lista as provas de um cargo (cargo_id) ou de todo o concurso (concurso_id). */
function acao_provas_listar(array $in): array
{
    if (!empty($in['cargo_id'])) {
        $provas = todos('SELECT p.*, c.nome AS cargo FROM provas p JOIN cargos c ON c.id = p.cargo_id WHERE p.cargo_id = ? ORDER BY p.id', [(int)$in['cargo_id']]);
    } else {
        $provas = todos('SELECT p.*, c.nome AS cargo FROM provas p JOIN cargos c ON c.id = p.cargo_id WHERE c.concurso_id = ? ORDER BY c.id, p.id', [(int)($in['concurso_id'] ?? 0)]);
    }
    return ['provas' => array_map('provaDetalhada', $provas)];
}

function acao_prova_salvar(array $in): array
{
    $id = (int)($in['id'] ?? 0);
    $cargoId = (int)($in['cargo_id'] ?? 0);
    if (!um('SELECT id FROM cargos WHERE id = ?', [$cargoId])) {
        falha('Campo obrigatório não informado: Cargo.');
    }
    $tipo = strtoupper(obrigatorio($in, 'tipo', 'Tipo'));
    if (!in_array($tipo, ['OBJETIVA', 'DISCURSIVA', 'PRATICA'], true)) {
        falha('Tipo de prova inválido.');
    }
    // E1 – campos obrigatórios
    $area = obrigatorio($in, 'area', 'Área de conhecimento');
    $qi = $qf = null;
    $pontuacao = 1.0;
    if ($tipo !== 'PRATICA') { // A1 – prova prática dispensa a faixa de questões
        $qi = inteiroObrigatorio($in, 'q_inicial', 'Nº inicial');
        $qf = inteiroObrigatorio($in, 'q_final', 'Nº final');
        // E2 – faixa de questões inválida
        if ($qf < $qi) {
            falha('Número final da questão deve ser maior ou igual ao número inicial.');
        }
        if ($qi < 1) {
            falha('Número inicial da questão deve ser maior que zero.');
        }
    }
    // E3 – percentual mínimo inválido
    $pctMin = campo($in, 'pct_min') === '' ? 0.0 : numeroObrigatorio($in, 'pct_min', '% mínimo');
    if ($pctMin < 0 || $pctMin > 100) {
        falha('Percentual mínimo deve estar entre 0 e 100.');
    }
    if ($tipo === 'OBJETIVA') {
        $pontuacao = campo($in, 'pontuacao') === '' ? 1.0 : numeroObrigatorio($in, 'pontuacao', 'Pontuação por questão');
        if ($pontuacao <= 0) {
            falha('Pontuação por questão deve ser maior que zero.');
        }
    }
    $peso = numeroObrigatorio($in, 'peso', 'Peso');
    if ($peso <= 0) {
        falha('Peso deve ser maior que zero.');
    }
    $carater = strtoupper(obrigatorio($in, 'carater', 'Caráter'));
    if (!in_array($carater, ['E', 'C'], true)) {
        falha('Caráter inválido.');
    }
    $data = dataObrigatoria($in, 'data_realizacao', 'Data de realização');

    $dados = ['tipo' => $tipo, 'area' => $area, 'q_inicial' => $qi, 'q_final' => $qf, 'peso' => $peso,
        'carater' => $carater, 'data_realizacao' => $data, 'pct_min' => $pctMin];

    transacao(function () use (&$id, $cargoId, $dados, $tipo, $qi, $qf, $pontuacao) {
        if ($id) {
            $antiga = provaOuFalha($id);
            $mudouFaixa = $antiga['tipo'] !== $tipo || (int)$antiga['q_inicial'] !== (int)$qi || (int)$antiga['q_final'] !== (int)$qf;
            if ($mudouFaixa && valor('SELECT COUNT(*) FROM aplicacoes WHERE prova_id = ?', [$id])) {
                falha('A prova já possui registros de aplicação: tipo e faixa de questões não podem ser alterados.');
            }
            atualizar('provas', $dados, $id);
            if ($mudouFaixa) {
                q('DELETE FROM questoes WHERE prova_id = ?', [$id]);
            }
        } else {
            // código sequencial por cargo: P1, P2, P3...
            $n = 1;
            foreach (todos('SELECT codigo FROM provas WHERE cargo_id = ?', [$cargoId]) as $ex) {
                $n = max($n, (int)substr($ex['codigo'], 1) + 1);
            }
            $id = inserir('provas', $dados + ['cargo_id' => $cargoId, 'codigo' => "P$n"]);
            $mudouFaixa = true;
        }
        if ($tipo === 'OBJETIVA' && $mudouFaixa) {
            for ($num = $qi; $num <= $qf; $num++) {
                inserir('questoes', ['prova_id' => $id, 'numero' => $num, 'pontuacao' => $pontuacao]);
            }
        }
    });

    $p = provaDetalhada(provaOuFalha($id));
    $tipos = ['OBJETIVA' => 'Objetiva', 'DISCURSIVA' => 'Discursiva', 'PRATICA' => 'Prática'];
    $resumo = "{$p['codigo']} – {$tipos[$p['tipo']]}";
    if ($p['tipo'] === 'OBJETIVA') {
        $resumo .= " – {$p['questoes']} questões – " . pctTexto($p['pontos_possiveis']) . ' pontos possíveis';
    }
    return ['mensagem' => empty($in['id']) ? 'Prova cadastrada com sucesso.' : 'Prova alterada com sucesso.',
        'resumo' => $resumo, 'prova' => $p];
}

function acao_prova_excluir(array $in): array
{
    $p = provaOuFalha((int)($in['id'] ?? 0));
    if (valor('SELECT COUNT(*) FROM aplicacoes WHERE prova_id = ?', [$p['id']])) {
        falha('A prova já possui registros de aplicação e não pode ser excluída.');
    }
    q('DELETE FROM provas WHERE id = ?', [$p['id']]);
    return ['mensagem' => "Prova {$p['codigo']} excluída."];
}

/** RF005 – questões objetivas: número e pontuação (alternativas A a E). */
function acao_questoes_listar(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    $qs = todos('SELECT id, numero, pontuacao, anulada FROM questoes WHERE prova_id = ? ORDER BY numero', [$p['id']]);
    return ['prova' => provaDetalhada($p), 'questoes' => $qs];
}

function acao_questoes_salvar(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    if ($p['tipo'] !== 'OBJETIVA') {
        falha('Somente provas objetivas possuem questões pontuadas.');
    }
    $pontos = is_array($in['pontuacoes'] ?? null) ? $in['pontuacoes'] : [];
    transacao(function () use ($p, $pontos) {
        foreach (questoesDaProva((int)$p['id']) as $qst) {
            $v = numero((string)($pontos[$qst['numero']] ?? ''));
            if ($v === null || $v <= 0) {
                falha("Pontuação inválida na questão {$qst['numero']}.");
            }
            q('UPDATE questoes SET pontuacao = ? WHERE id = ?', [$v, $qst['id']]);
        }
    });
    return ['mensagem' => 'Pontuação das questões gravada com sucesso.', 'prova' => provaDetalhada(provaOuFalha((int)$p['id']))];
}

/** RF006 / A2 – ordem das provas para desempate; o critério final "Candidato mais idoso" é automático. */
function acao_desempate_salvar(array $in): array
{
    $cargoId = (int)($in['cargo_id'] ?? 0);
    $ordem = array_values(array_map('intval', is_array($in['ordem'] ?? null) ? $in['ordem'] : []));
    $provas = array_column(provasDoCargo($cargoId), null, 'id');
    if (!$provas) {
        falha('Cadastre as provas do cargo antes de definir os critérios de desempate.');
    }
    if (count($ordem) !== count(array_unique($ordem))) {
        falha('A mesma prova não pode aparecer duas vezes nos critérios de desempate.');
    }
    foreach ($ordem as $pid) {
        if (!isset($provas[$pid])) {
            falha('Prova inválida nos critérios de desempate.');
        }
    }
    transacao(function () use ($cargoId, $ordem) {
        q('UPDATE provas SET ordem_desempate = NULL WHERE cargo_id = ?', [$cargoId]);
        foreach ($ordem as $i => $pid) {
            q('UPDATE provas SET ordem_desempate = ? WHERE id = ?', [$i + 1, $pid]);
        }
    });
    $codigos = array_map(fn($pid) => $provas[$pid]['codigo'], $ordem);
    $codigos[] = 'Candidato mais idoso';
    return ['mensagem' => 'Critérios de desempate gravados com sucesso.', 'ordem' => implode(', ', $codigos)];
}
