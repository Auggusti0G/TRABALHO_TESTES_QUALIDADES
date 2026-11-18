<?php
/** UC09 e UC10 – Site do Candidato: documentos e resultados (RF020 a RF025). Acesso público. */

function acao_site_concursos(array $in): array
{
    $lista = todos('SELECT c.id, c.empresa, c.edital, c.data_publicacao, c.taxa, c.inicio_inscricoes, c.termino_inscricoes,
                           (SELECT COALESCE(SUM(l.vagas), 0) FROM localidades l JOIN cargos g ON g.id = l.cargo_id WHERE g.concurso_id = c.id) AS vagas
                    FROM concursos c ORDER BY c.data_publicacao DESC, c.id DESC');
    return ['concursos' => $lista, 'hoje' => hoje(), 'data_real' => date('Y-m-d')];
}

function acao_site_concurso(array $in): array
{
    $c = concursoOuFalha((int)($in['id'] ?? 0));
    $cargos = todos('SELECT id, nome FROM cargos WHERE concurso_id = ? ORDER BY id', [$c['id']]);
    foreach ($cargos as &$cargo) {
        $cargo['localidades'] = todos('SELECT id, uf, municipio, vagas, vagas_pcd FROM localidades WHERE cargo_id = ? ORDER BY id', [$cargo['id']]);
        $cargo['provas'] = array_map(fn($p) => ['codigo' => $p['codigo'], 'rotulo' => rotuloProva($p), 'data' => $p['data_realizacao'],
            'carater' => $p['carater'], 'peso' => $p['peso'], 'pct_min' => $p['pct_min']], provasDoCargo((int)$cargo['id']));
    }
    unset($c['correcao_em']);
    return ['concurso' => $c, 'cargos' => $cargos, 'hoje' => hoje(),
        'liberacao_documentos' => liberacaoDocumentos($c), 'liberacao_gabarito' => liberacaoGabarito((int)$c['id'])];
}

/** RF020 – lista de candidatos x locais de prova. */
function acao_site_locais(array $in): array
{
    $c = concursoOuFalha((int)($in['id'] ?? 0));
    exigirLiberado(liberacaoDocumentos($c)); // E1
    $total = valor('SELECT COUNT(*) FROM locais x JOIN provas p ON p.id = x.prova_id JOIN cargos g ON g.id = p.cargo_id WHERE g.concurso_id = ?', [$c['id']]);
    if (!$total) {
        falha('Lista de locais de prova ainda não disponível.'); // E2
    }
    $linhas = todos('SELECT k.inscricao, k.nome, g.nome AS cargo, p.codigo, p.area, p.data_realizacao, x.local, x.endereco, x.sala, x.horario
                     FROM alocacoes a JOIN candidatos k ON k.id = a.candidato_id JOIN provas p ON p.id = a.prova_id
                     JOIN cargos g ON g.id = p.cargo_id JOIN locais x ON x.id = a.local_id
                     WHERE g.concurso_id = ? ORDER BY k.nome, p.id', [$c['id']]);
    return ['linhas' => $linhas];
}

/** RF021 – relação candidato/vaga por cargo e localidade. */
function acao_site_vagas(array $in): array
{
    $c = concursoOuFalha((int)($in['id'] ?? 0));
    exigirLiberado(liberacaoDocumentos($c));
    $linhas = todos('SELECT g.nome AS cargo, l.municipio, l.uf, l.vagas, l.vagas_pcd,
                            (SELECT COUNT(*) FROM candidatos k WHERE k.localidade_id = l.id) AS inscritos,
                            (SELECT COUNT(*) FROM candidatos k WHERE k.localidade_id = l.id AND k.pcd = 1) AS inscritos_pcd
                     FROM localidades l JOIN cargos g ON g.id = l.cargo_id WHERE g.concurso_id = ? ORDER BY g.id, l.id', [$c['id']]);
    foreach ($linhas as &$l) {
        $l['relacao'] = $l['vagas'] > 0 ? round($l['inscritos'] / $l['vagas'], 2) : 0;
    }
    return ['linhas' => $linhas];
}

/** RF022 – cartão de confirmação (A1: candidato informa CPF e nº de inscrição). */
function acao_site_cartao(array $in): array
{
    $c = concursoOuFalha((int)($in['id'] ?? 0));
    $cpf = soDigitos(obrigatorio($in, 'cpf', 'CPF'));
    $inscricao = obrigatorio($in, 'inscricao', 'Nº de inscrição');
    exigirLiberado(liberacaoDocumentos($c));
    $k = um('SELECT k.id, k.inscricao, k.nome, k.cpf, k.nascimento, k.pcd, k.deficiencia, g.nome AS cargo, l.municipio, l.uf
             FROM candidatos k JOIN cargos g ON g.id = k.cargo_id JOIN localidades l ON l.id = k.localidade_id
             WHERE k.concurso_id = ? AND k.cpf = ? AND k.inscricao = ?', [$c['id'], $cpf, $inscricao]);
    if (!$k) {
        falha('Inscrição não encontrada para o CPF informado.'); // E3
    }
    $provas = todos('SELECT p.codigo, p.tipo, p.area, p.data_realizacao, x.local, x.endereco, x.sala, x.horario
                     FROM provas p JOIN candidatos k ON k.cargo_id = p.cargo_id
                     LEFT JOIN alocacoes a ON a.prova_id = p.id AND a.candidato_id = k.id
                     LEFT JOIN locais x ON x.id = a.local_id
                     WHERE k.id = ? ORDER BY p.id', [$k['id']]);
    $k['cpf'] = cpfMascarado($k['cpf']);
    unset($k['id']);
    return ['concurso' => ['empresa' => $c['empresa'], 'edital' => $c['edital']], 'candidato' => $k, 'provas' => $provas];
}

/** RF023 – gabarito oficial das provas objetivas. */
function acao_site_gabarito(array $in): array
{
    $c = concursoOuFalha((int)($in['id'] ?? 0));
    exigirLiberado(liberacaoGabarito((int)$c['id']));
    $provas = todos("SELECT p.id, p.codigo, p.area, g.nome AS cargo FROM provas p JOIN cargos g ON g.id = p.cargo_id
                     WHERE g.concurso_id = ? AND p.tipo = 'OBJETIVA' ORDER BY g.id, p.id", [$c['id']]);
    foreach ($provas as &$p) {
        $p['questoes'] = todos('SELECT numero, gabarito, anulada FROM questoes WHERE prova_id = ? ORDER BY numero', [$p['id']]);
        foreach ($p['questoes'] as $qst) {
            if (!$qst['gabarito'] && !$qst['anulada']) {
                falha('Gabarito oficial ainda não cadastrado.');
            }
        }
    }
    if (!$provas) {
        falha('Gabarito oficial ainda não cadastrado.');
    }
    return ['provas' => $provas];
}

/** RF024 – resultado parcial: notas por prova, em ordem de inscrição e sem classificação. */
function acao_site_parcial(array $in): array
{
    $c = concursoOuFalha((int)($in['id'] ?? 0));
    if (!$c['correcao_em']) {
        falha('Resultado ainda não divulgado.'); // E1
    }
    $provas = array_values(array_unique(array_column(
        todos('SELECT p.codigo FROM provas p JOIN cargos g ON g.id = p.cargo_id WHERE g.concurso_id = ? ORDER BY p.id', [$c['id']]), 'codigo')));
    $linhas = array_map(fn($k) => ['inscricao' => $k['inscricao'], 'nome' => $k['nome'], 'cargo' => $k['cargo'], 'notas' => $k['notas']],
        array_filter(quadroDeNotas((int)$c['id']), fn($k) => $k['situacao'] !== 'Pendente' && $k['situacao'] !== null));
    return ['provas' => $provas, 'linhas' => array_values($linhas)];
}

/** RF025 – resultado final com classificação por cargo e localidade. */
function acao_site_final(array $in): array
{
    $c = concursoOuFalha((int)($in['id'] ?? 0));
    $cargoId = (int)obrigatorio($in, 'cargo_id', 'Cargo');
    $locId = (int)obrigatorio($in, 'localidade_id', 'Localidade');
    $loc = um('SELECT l.*, g.nome AS cargo FROM localidades l JOIN cargos g ON g.id = l.cargo_id WHERE l.id = ? AND g.id = ? AND g.concurso_id = ?',
        [$locId, $cargoId, $c['id']]) ?? falha('Cargo ou localidade inválidos.');
    $pendentes = valor("SELECT COUNT(*) FROM recursos r JOIN provas p ON p.id = r.prova_id JOIN cargos g ON g.id = p.cargo_id
                        WHERE g.concurso_id = ? AND r.situacao = 'Em análise'", [$c['id']]);
    // E1 – correção ou julgamento dos recursos não concluído
    if (!$c['correcao_em'] || $pendentes) {
        falha('Resultado ainda não divulgado.');
    }
    $r = classificar((int)$c['id'], $cargoId, $locId);
    $limpar = fn($k) => ['posicao' => $k['posicao'] ?? null, 'inscricao' => $k['inscricao'], 'nome' => $k['nome'], 'pcd' => (int)$k['pcd'],
        'nota_final' => $k['nota_final'], 'notas' => $k['notas'], 'motivo' => $k['motivo']];
    return [
        'localidade'    => ['cargo' => $loc['cargo'], 'municipio' => $loc['municipio'], 'uf' => $loc['uf'], 'vagas' => (int)$loc['vagas'], 'vagas_pcd' => (int)$loc['vagas_pcd']],
        'provas'        => array_column(provasDoCargo($cargoId), 'codigo'),
        'desempate'     => $r['desempate'],
        'classificados' => array_map($limpar, $r['classificados']),
        'eliminados'    => array_map($limpar, $r['eliminados']),
    ];
}
