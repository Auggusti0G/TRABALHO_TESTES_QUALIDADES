<?php
/** UC08 – Cadastrar e Julgar Recurso (RF018, RF019). */

function acao_recursos_listar(array $in): array
{
    $lista = todos('SELECT r.*, c.inscricao, c.nome, p.codigo, p.area, g.nome AS cargo, x.gabarito AS gabarito_atual, x.anulada
                    FROM recursos r
                    JOIN candidatos c ON c.id = r.candidato_id
                    JOIN provas p ON p.id = r.prova_id
                    JOIN cargos g ON g.id = p.cargo_id
                    LEFT JOIN questoes x ON x.prova_id = r.prova_id AND x.numero = r.questao
                    WHERE g.concurso_id = ? ORDER BY r.id DESC', [(int)($in['concurso_id'] ?? 0)]);
    return ['recursos' => $lista];
}

/** Cadastro do recurso pelo Departamento de Resultados (situação inicial "Em análise"). */
function acao_recurso_salvar(array $in): array
{
    $inscricao = obrigatorio($in, 'inscricao', 'Nº de inscrição');
    $provaId = (int)obrigatorio($in, 'prova_id', 'Prova');
    $questao = inteiroObrigatorio($in, 'questao', 'Questão');
    $p = provaOuFalha($provaId);
    if ($p['tipo'] !== 'OBJETIVA') {
        falha('Recursos referem-se a questões de provas objetivas.');
    }
    $c = um('SELECT id FROM candidatos WHERE inscricao = ? AND cargo_id = ?', [$inscricao, $p['cargo_id']])
        ?? falha('Inscrição não encontrada.');
    // E1 – questão fora da faixa da prova
    $qst = um('SELECT * FROM questoes WHERE prova_id = ? AND numero = ?', [$provaId, $questao])
        ?? falha('Questão não pertence à prova informada.');
    if (!$qst['gabarito'] && !$qst['anulada']) {
        falha('Gabarito oficial ainda não cadastrado para esta prova.');
    }
    if (um("SELECT id FROM recursos WHERE candidato_id = ? AND prova_id = ? AND questao = ? AND situacao = 'Em análise'",
        [$c['id'], $provaId, $questao])) {
        falha('Já existe um recurso em análise deste candidato para esta questão.');
    }
    inserir('recursos', ['candidato_id' => $c['id'], 'prova_id' => $provaId, 'questao' => $questao,
        'situacao' => 'Em análise', 'criado_em' => agora(), 'criado_por' => usuarioAtual()['login']]);
    return ['mensagem' => 'Recurso cadastrado com sucesso.', 'detalhe' => 'Situação: Em análise'];
}

/** Registro do resultado da análise da equipe técnica pelo Supervisor, com recorreção automática. */
function acao_recurso_julgar(array $in): array
{
    $r = um('SELECT r.*, p.codigo, g.concurso_id FROM recursos r JOIN provas p ON p.id = r.prova_id
             JOIN cargos g ON g.id = p.cargo_id WHERE r.id = ?', [(int)($in['id'] ?? 0)]) ?? falha('Recurso não encontrado.', 404);
    if ($r['situacao'] !== 'Em análise') {
        falha('Este recurso já foi julgado.');
    }
    $resultado = strtoupper(obrigatorio($in, 'resultado', 'Resultado da análise'));
    $qst = um('SELECT * FROM questoes WHERE prova_id = ? AND numero = ?', [$r['prova_id'], $r['questao']]);
    $ref = "Recurso #{$r['id']} – questão {$r['questao']} da prova {$r['codigo']}";
    $fecho = ['julgado_em' => agora(), 'julgado_por' => usuarioAtual()['login']];

    switch ($resultado) {
        case 'INDEFERIDO': // A1
            atualizar('recursos', ['situacao' => 'Indeferido'] + $fecho, (int)$r['id']);
            auditar('RECURSO', $ref, 'Em análise', 'Indeferido');
            return ['mensagem' => 'Recurso indeferido.', 'detalhe' => 'Gabarito oficial e notas inalterados.'];

        case 'ALTERAR': // fluxo básico – mudança de gabarito
            $nova = strtoupper(obrigatorio($in, 'nova_alternativa', 'Nova alternativa'));
            if (!in_array($nova, ALTERNATIVAS, true)) {
                falha('Alternativa inválida. Use A, B, C, D ou E.');
            }
            if ($qst['anulada']) {
                falha('A questão já foi anulada: não é possível alterar o gabarito.');
            }
            if ($nova === $qst['gabarito']) {
                falha('A nova alternativa é igual ao gabarito oficial atual.');
            }
            transacao(function () use ($r, $qst, $nova, $fecho) {
                q('UPDATE questoes SET gabarito = ? WHERE id = ?', [$nova, $qst['id']]);
                atualizar('recursos', ['situacao' => 'Deferido – gabarito alterado', 'nova_alternativa' => $nova] + $fecho, (int)$r['id']);
                corrigirConcurso((int)$r['concurso_id']);
            });
            auditar('RECURSO', "$ref – mudança de gabarito", "Q{$r['questao']} = {$qst['gabarito']}", "Q{$r['questao']} = $nova");
            return ['mensagem' => 'Recurso deferido. Notas recalculadas.',
                'detalhe' => "Gabarito oficial Q{$r['questao']}: {$qst['gabarito']} → $nova"];

        case 'ANULAR': // A2 – a pontuação é atribuída a todos os candidatos presentes
            if ($qst['anulada']) {
                falha('A questão já foi anulada.');
            }
            transacao(function () use ($r, $qst, $fecho) {
                q('UPDATE questoes SET anulada = 1 WHERE id = ?', [$qst['id']]);
                atualizar('recursos', ['situacao' => 'Deferido – questão anulada'] + $fecho, (int)$r['id']);
                corrigirConcurso((int)$r['concurso_id']);
            });
            auditar('RECURSO', "$ref – anulação", "Q{$r['questao']} = {$qst['gabarito']}", "Q{$r['questao']} anulada");
            return ['mensagem' => 'Questão anulada. Notas recalculadas.',
                'detalhe' => "Questão {$r['questao']} anulada: pontuação atribuída a todos os candidatos presentes."];
    }
    falha('Resultado da análise inválido.');
}
