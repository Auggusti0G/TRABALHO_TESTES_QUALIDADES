<?php
/** UC06 – Registrar Ausências e Gabaritos dos Candidatos (RF012, RF013). */

/** E3 – localiza o candidato pelo nº de inscrição dentro do cargo da prova. */
function candidatoDaProva(array $prova, string $inscricao): array
{
    $c = um('SELECT id, inscricao, nome, cargo_id FROM candidatos WHERE inscricao = ? AND cargo_id = ?', [$inscricao, $prova['cargo_id']]);
    return $c ?? falha('Inscrição não encontrada.');
}

function acao_aplicacao_buscar(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    $c = candidatoDaProva($p, obrigatorio($in, 'inscricao', 'Nº de inscrição'));
    $ap = um('SELECT situacao, respostas FROM aplicacoes WHERE candidato_id = ? AND prova_id = ?', [$c['id'], $p['id']]);
    return [
        'candidato' => $c,
        'registro'  => $ap ? ['situacao' => $ap['situacao'], 'respostas' => json_decode($ap['respostas'] ?: '{}', true)] : null,
    ];
}

function acao_aplicacao_salvar(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    $c = candidatoDaProva($p, obrigatorio($in, 'inscricao', 'Nº de inscrição'));
    $situacao = strtoupper(obrigatorio($in, 'situacao', 'Situação'));
    if (!in_array($situacao, ['P', 'A'], true)) {
        falha('Situação inválida.');
    }
    $existente = um('SELECT * FROM aplicacoes WHERE candidato_id = ? AND prova_id = ?', [$c['id'], $p['id']]);

    // A1 – candidato ausente
    if ($situacao === 'A') {
        q('DELETE FROM aplicacoes WHERE candidato_id = ? AND prova_id = ?', [$c['id'], $p['id']]);
        inserir('aplicacoes', ['candidato_id' => $c['id'], 'prova_id' => $p['id'], 'situacao' => 'A']);
        return ['mensagem' => 'Ausência registrada com sucesso.', 'detalhe' => "Ausente em {$p['codigo']}"];
    }
    // E2 – gabarito para candidato registrado como ausente
    if ($existente && $existente['situacao'] === 'A') {
        falha('Candidato ausente nesta prova: gabarito não permitido.');
    }

    $respostas = null;
    $gravadas = 0;
    if ($p['tipo'] === 'OBJETIVA') {
        $recebidas = is_array($in['respostas'] ?? null) ? $in['respostas'] : [];
        $respostas = [];
        foreach (questoesDaProva((int)$p['id']) as $qst) {
            $r = strtoupper(trim((string)($recebidas[$qst['numero']] ?? '')));
            // E1 – alternativa inválida (em branco é permitido e não pontua)
            if ($r !== '' && !in_array($r, ALTERNATIVAS, true)) {
                falha("Alternativa inválida na questão {$qst['numero']}. Use A, B, C, D ou E.");
            }
            $respostas[$qst['numero']] = $r;
            $gravadas++;
        }
    }
    $dados = ['situacao' => 'P', 'respostas' => $respostas === null ? null : json_encode($respostas)];
    if ($existente) {
        atualizar('aplicacoes', $dados, (int)$existente['id']);
    } else {
        inserir('aplicacoes', $dados + ['candidato_id' => $c['id'], 'prova_id' => $p['id']]);
    }
    if ($p['tipo'] === 'OBJETIVA') {
        return ['mensagem' => 'Gabarito do candidato registrado com sucesso.', 'detalhe' => "Respostas gravadas: $gravadas"];
    }
    return ['mensagem' => 'Presença registrada com sucesso.', 'detalhe' => "Presente em {$p['codigo']}"];
}

function acao_aplicacao_excluir(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    $c = candidatoDaProva($p, obrigatorio($in, 'inscricao', 'Nº de inscrição'));
    q('DELETE FROM aplicacoes WHERE candidato_id = ? AND prova_id = ?', [$c['id'], $p['id']]);
    return ['mensagem' => 'Registro de aplicação excluído.'];
}

function acao_aplicacoes_listar(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    $lista = todos('SELECT c.inscricao, c.nome, a.situacao, a.respostas, a.nota
                    FROM candidatos c LEFT JOIN aplicacoes a ON a.candidato_id = c.id AND a.prova_id = ?
                    WHERE c.cargo_id = ? ORDER BY c.inscricao', [$p['id'], $p['cargo_id']]);
    foreach ($lista as &$l) {
        $resp = json_decode($l['respostas'] ?: '{}', true) ?: [];
        $l['respondidas'] = count(array_filter($resp, fn($r) => $r !== ''));
        unset($l['respostas']);
    }
    return ['prova' => $p, 'registros' => $lista];
}
