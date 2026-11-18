<?php
/** UC02 – Manter Concurso, Cargos e Localidades (RF002, RF003). */

function concursoCompleto(int $id): array
{
    $c = concursoOuFalha($id);
    $c['cargos'] = todos('SELECT * FROM cargos WHERE concurso_id = ? ORDER BY id', [$id]);
    foreach ($c['cargos'] as &$cargo) {
        $cargo['localidades'] = todos('SELECT * FROM localidades WHERE cargo_id = ? ORDER BY id', [$cargo['id']]);
        $cargo['total_vagas'] = array_sum(array_column($cargo['localidades'], 'vagas'));
    }
    return $c;
}

function acao_concursos_listar(array $in): array
{
    $lista = todos('SELECT c.*, (SELECT COUNT(*) FROM candidatos k WHERE k.concurso_id = c.id) AS inscritos,
                           (SELECT COALESCE(SUM(l.vagas), 0) FROM localidades l JOIN cargos g ON g.id = l.cargo_id WHERE g.concurso_id = c.id) AS vagas
                    FROM concursos c ORDER BY c.data_publicacao DESC, c.id DESC');
    return ['concursos' => $lista];
}

function acao_concurso_obter(array $in): array
{
    return ['concurso' => concursoCompleto((int)($in['id'] ?? 0))];
}

function acao_concurso_salvar(array $in): array
{
    $id = (int)($in['id'] ?? 0);
    // E1 – campos obrigatórios
    $dados = [
        'empresa'            => obrigatorio($in, 'empresa', 'Empresa-objeto'),
        'edital'             => obrigatorio($in, 'edital', 'Nº do edital'),
        'data_publicacao'    => dataObrigatoria($in, 'data_publicacao', 'Data de publicação'),
        'taxa'               => numeroObrigatorio($in, 'taxa', 'Taxa de inscrição'),
        'inicio_inscricoes'  => dataObrigatoria($in, 'inicio_inscricoes', 'Início das inscrições'),
        'termino_inscricoes' => dataObrigatoria($in, 'termino_inscricoes', 'Término das inscrições'),
        'pct_min_conjunto'   => numeroObrigatorio($in, 'pct_min_conjunto', '% mínimo do conjunto'),
    ];
    if ($dados['taxa'] < 0) {
        falha('Taxa de inscrição não pode ser negativa.');
    }
    // E3 – período de inscrições inválido
    if ($dados['termino_inscricoes'] < $dados['inicio_inscricoes'] || $dados['inicio_inscricoes'] < $dados['data_publicacao']) {
        falha('Período de inscrições inválido.');
    }
    if ($dados['pct_min_conjunto'] < 0 || $dados['pct_min_conjunto'] > 100) {
        falha('Percentual mínimo deve estar entre 0 e 100.');
    }

    $cargos = is_array($in['cargos'] ?? null) ? $in['cargos'] : [];
    if (!$cargos) {
        falha('Campo obrigatório não informado: Cargo.');
    }
    foreach ($cargos as $i => $cargo) {
        obrigatorio($cargo, 'nome', 'Cargo');
        $locs = is_array($cargo['localidades'] ?? null) ? $cargo['localidades'] : [];
        if (!$locs) {
            falha('Campo obrigatório não informado: Localidade do cargo ' . campo($cargo, 'nome') . '.');
        }
        foreach ($locs as $j => $l) {
            $uf = strtoupper(obrigatorio($l, 'uf', 'UF'));
            if (!preg_match('/^[A-Z]{2}$/', $uf)) {
                falha('UF inválida. Informe a sigla com duas letras.');
            }
            obrigatorio($l, 'municipio', 'Município');
            $vagas = inteiroObrigatorio($l, 'vagas', 'Vagas totais');
            $pcd = campo($l, 'vagas_pcd') === '' ? 0 : inteiroObrigatorio($l, 'vagas_pcd', 'Vagas PcD');
            if ($vagas < 1) {
                falha('Vagas totais deve ser maior que zero.');
            }
            // E2 – vagas para deficientes maiores que as vagas totais
            if ($pcd > $vagas) {
                falha('Vagas para deficientes não podem exceder as vagas totais.');
            }
            $cargos[$i]['localidades'][$j] = ['id' => (int)($l['id'] ?? 0), 'uf' => $uf,
                'municipio' => campo($l, 'municipio'), 'vagas' => $vagas, 'vagas_pcd' => $pcd];
        }
    }
    // RNF007 – nº do edital único por empresa-objeto
    if (um('SELECT id FROM concursos WHERE empresa = ? AND edital = ? AND id <> ?', [$dados['empresa'], $dados['edital'], $id])) {
        falha('Já existe um concurso com este nº de edital para a empresa-objeto.');
    }

    transacao(function () use (&$id, $dados, $cargos) {
        if ($id) {
            concursoOuFalha($id);
            atualizar('concursos', $dados, $id);
        } else {
            $id = inserir('concursos', $dados);
        }
        $cargosMantidos = [];
        foreach ($cargos as $cargo) {
            $cid = (int)($cargo['id'] ?? 0);
            if ($cid && um('SELECT id FROM cargos WHERE id = ? AND concurso_id = ?', [$cid, $id])) {
                atualizar('cargos', ['nome' => campo($cargo, 'nome')], $cid);
            } else {
                $cid = inserir('cargos', ['concurso_id' => $id, 'nome' => campo($cargo, 'nome')]);
            }
            $cargosMantidos[] = $cid;
            $locMantidas = [];
            foreach ($cargo['localidades'] as $l) {
                $lid = $l['id'];
                unset($l['id']);
                if ($lid && um('SELECT id FROM localidades WHERE id = ? AND cargo_id = ?', [$lid, $cid])) {
                    atualizar('localidades', $l, $lid);
                } else {
                    $lid = inserir('localidades', $l + ['cargo_id' => $cid]);
                }
                $locMantidas[] = $lid;
            }
            foreach (todos('SELECT id, municipio FROM localidades WHERE cargo_id = ?', [$cid]) as $ex) {
                if (!in_array((int)$ex['id'], $locMantidas, true)) {
                    if (valor('SELECT COUNT(*) FROM candidatos WHERE localidade_id = ?', [$ex['id']])) {
                        falha("A localidade {$ex['municipio']} possui candidatos inscritos e não pode ser removida.");
                    }
                    q('DELETE FROM localidades WHERE id = ?', [$ex['id']]);
                }
            }
        }
        foreach (todos('SELECT id, nome FROM cargos WHERE concurso_id = ?', [$id]) as $ex) {
            if (!in_array((int)$ex['id'], $cargosMantidos, true)) {
                if (valor('SELECT COUNT(*) FROM candidatos WHERE cargo_id = ?', [$ex['id']])) {
                    falha("O cargo {$ex['nome']} possui candidatos inscritos e não pode ser removido.");
                }
                q('DELETE FROM cargos WHERE id = ?', [$ex['id']]);
            }
        }
    });

    return [
        'mensagem' => empty($in['id']) ? 'Concurso cadastrado com sucesso.' : 'Concurso alterado com sucesso.',
        'concurso' => concursoCompleto($id),
    ];
}

/** Indicadores da tela inicial. */
function acao_painel(array $in): array
{
    $id = (int)($in['concurso_id'] ?? 0);
    if (!$id || !um('SELECT id FROM concursos WHERE id = ?', [$id])) {
        return ['painel' => null];
    }
    $c = concursoOuFalha($id);
    $porProva = 'FROM %s x JOIN provas p ON p.id = x.prova_id JOIN cargos g ON g.id = p.cargo_id WHERE g.concurso_id = ?';
    return ['painel' => [
        'concurso'    => $c,
        'cargos'      => (int)valor('SELECT COUNT(*) FROM cargos WHERE concurso_id = ?', [$id]),
        'vagas'       => (int)valor('SELECT COALESCE(SUM(l.vagas),0) FROM localidades l JOIN cargos g ON g.id = l.cargo_id WHERE g.concurso_id = ?', [$id]),
        'provas'      => (int)valor('SELECT COUNT(*) FROM provas p JOIN cargos g ON g.id = p.cargo_id WHERE g.concurso_id = ?', [$id]),
        'candidatos'  => (int)valor('SELECT COUNT(*) FROM candidatos WHERE concurso_id = ?', [$id]),
        'locais'      => (int)valor('SELECT COUNT(*) ' . sprintf($porProva, 'locais'), [$id]),
        'alocacoes'   => (int)valor('SELECT COUNT(*) ' . sprintf($porProva, 'alocacoes'), [$id]),
        'aplicacoes'  => (int)valor('SELECT COUNT(*) ' . sprintf($porProva, 'aplicacoes'), [$id]),
        'eliminados'  => (int)valor("SELECT COUNT(*) FROM candidatos WHERE concurso_id = ? AND situacao = 'Eliminado'", [$id]),
        'aptos'       => (int)valor("SELECT COUNT(*) FROM candidatos WHERE concurso_id = ? AND situacao = 'Não eliminado'", [$id]),
        'recursos_pendentes' => (int)valor("SELECT COUNT(*) " . sprintf($porProva, 'recursos') . " AND x.situacao = 'Em análise'", [$id]),
        'limite_cadastro'    => limiteCadastro($c),
        'liberacao_documentos' => liberacaoDocumentos($c),
        'liberacao_gabarito' => liberacaoGabarito($id),
    ]];
}
