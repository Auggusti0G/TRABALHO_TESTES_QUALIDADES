<?php
/** UC05 – Cadastrar Locais de Prova e Alocar Candidatos (RF010, RF011). */

function acao_locais_listar(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    $locais = todos('SELECT x.*, l.municipio, l.uf,
                            (SELECT COUNT(*) FROM alocacoes a WHERE a.local_id = x.id) AS alocados
                     FROM locais x JOIN localidades l ON l.id = x.localidade_id
                     WHERE x.prova_id = ? ORDER BY l.id, x.local, x.sala', [$p['id']]);
    $localidades = todos('SELECT l.*,
                            (SELECT COUNT(*) FROM candidatos c WHERE c.localidade_id = l.id) AS candidatos,
                            (SELECT COALESCE(SUM(x.capacidade), 0) FROM locais x WHERE x.localidade_id = l.id AND x.prova_id = ?) AS capacidade,
                            (SELECT COUNT(*) FROM alocacoes a JOIN candidatos c ON c.id = a.candidato_id
                              WHERE c.localidade_id = l.id AND a.prova_id = ?) AS alocados
                          FROM localidades l WHERE l.cargo_id = ? ORDER BY l.id', [$p['id'], $p['id'], $p['cargo_id']]);
    return ['prova' => $p, 'locais' => $locais, 'localidades' => $localidades];
}

function acao_local_salvar(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    // E1 – campos obrigatórios
    $locId = (int)obrigatorio($in, 'localidade_id', 'Localidade');
    $dados = [
        'prova_id'      => $p['id'],
        'localidade_id' => $locId,
        'local'         => obrigatorio($in, 'local', 'Local'),
        'endereco'      => obrigatorio($in, 'endereco', 'Endereço'),
        'sala'          => obrigatorio($in, 'sala', 'Sala'),
        'capacidade'    => inteiroObrigatorio($in, 'capacidade', 'Capacidade'),
        'horario'       => obrigatorio($in, 'horario', 'Horário'),
    ];
    if (!um('SELECT id FROM localidades WHERE id = ? AND cargo_id = ?', [$locId, $p['cargo_id']])) {
        falha('Localidade não pertence ao cargo da prova.');
    }
    if ($dados['capacidade'] < 1) {
        falha('Capacidade deve ser maior que zero.');
    }
    $h = str_replace('h', ':', strtolower($dados['horario']));
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $h)) {
        falha('Horário inválido. Use o formato HH:MM.');
    }
    $dados['horario'] = $h;
    if (um('SELECT id FROM locais WHERE prova_id = ? AND localidade_id = ? AND local = ? AND sala = ?',
        [$p['id'], $locId, $dados['local'], $dados['sala']])) {
        falha('Esta sala já está cadastrada para a prova.');
    }
    inserir('locais', $dados);
    return ['mensagem' => 'Local de prova cadastrado com sucesso.'];
}

function acao_local_excluir(array $in): array
{
    q('DELETE FROM locais WHERE id = ?', [(int)($in['id'] ?? 0)]);
    return ['mensagem' => 'Local de prova excluído. Os candidatos que estavam nesta sala ficaram sem local.'];
}

/** RF011 – distribui os candidatos da localidade nas salas cadastradas, em ordem de inscrição. */
function acao_alocar(array $in): array
{
    $p = provaOuFalha((int)($in['prova_id'] ?? 0));
    $locId = (int)obrigatorio($in, 'localidade_id', 'Localidade');
    $salas = todos('SELECT id, capacidade FROM locais WHERE prova_id = ? AND localidade_id = ? ORDER BY local, sala, id', [$p['id'], $locId]);
    if (!$salas) {
        falha('Nenhum local de prova cadastrado para esta localidade.');
    }
    $cands = todos('SELECT id FROM candidatos WHERE localidade_id = ? AND cargo_id = ? ORDER BY inscricao', [$locId, $p['cargo_id']]);
    if (!$cands) {
        falha('Não há candidatos inscritos nesta localidade.');
    }

    $alocados = transacao(function () use ($p, $salas, $cands) {
        $n = 0;
        $fila = [];
        foreach ($salas as $s) {
            for ($i = 0; $i < (int)$s['capacidade']; $i++) {
                $fila[] = $s['id'];
            }
        }
        foreach ($cands as $i => $c) {
            q('DELETE FROM alocacoes WHERE candidato_id = ? AND prova_id = ?', [$c['id'], $p['id']]);
            if (isset($fila[$i])) {
                inserir('alocacoes', ['candidato_id' => $c['id'], 'prova_id' => $p['id'], 'local_id' => $fila[$i]]);
                $n++;
            }
        }
        return $n;
    });

    $sem = count($cands) - $alocados;
    // E2 – capacidade insuficiente (alocação parcial; exige o cadastro de novas salas)
    return [
        'mensagem'  => $sem > 0 ? "Capacidade insuficiente: $sem candidatos sem local." : 'Candidatos alocados com sucesso.',
        'aviso'     => $sem > 0,
        'alocados'  => $alocados,
        'sem_local' => $sem,
    ];
}
