<?php
/**
 * SGCP – API (roteador único).
 * Uso: api/index.php?a=<acao>  –  corpo e resposta em JSON.
 */

date_default_timezone_set('America/Sao_Paulo');

require __DIR__ . '/lib/helpers.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/regras.php';
require __DIR__ . '/lib/auth.php';

const S = 'SELECAO';
const R = 'RESULTADOS';
const V = 'SUPERVISOR';

// ação => [arquivo, perfis autorizados]  ('*' = qualquer usuário autenticado, null = público)
$rotas = [
    'login'               => ['auth', null],
    'logout'              => ['auth', null],
    'sessao'              => ['auth', null],

    'painel'              => ['concursos', '*'],
    'concursos_listar'    => ['concursos', '*'],
    'concurso_obter'      => ['concursos', '*'],
    'concurso_salvar'     => ['concursos', [S]],

    'provas_listar'       => ['provas', '*'],
    'prova_salvar'        => ['provas', [S]],
    'prova_excluir'       => ['provas', [S]],
    'questoes_listar'     => ['provas', '*'],
    'questoes_salvar'     => ['provas', [S]],
    'desempate_salvar'    => ['provas', [S]],

    'candidato_prazo'     => ['candidatos', [S]],
    'candidato_salvar'    => ['candidatos', [S]],
    'candidatos_listar'   => ['candidatos', '*'],

    'locais_listar'       => ['locais', '*'],
    'local_salvar'        => ['locais', [S]],
    'local_excluir'       => ['locais', [S]],
    'alocar'              => ['locais', [S]],

    'aplicacao_buscar'    => ['aplicacao', [R]],
    'aplicacao_salvar'    => ['aplicacao', [R]],
    'aplicacao_excluir'   => ['aplicacao', [R]],
    'aplicacoes_listar'   => ['aplicacao', [R, V]],

    'gabarito_obter'      => ['correcao', [V]],
    'gabarito_salvar'     => ['correcao', [V]],
    'notas_listar'        => ['correcao', [V]],
    'notas_salvar'        => ['correcao', [V]],
    'correcao_executar'   => ['correcao', [V]],
    'correcao_resumo'     => ['correcao', [V]],

    'recursos_listar'     => ['recursos', [R, V]],
    'recurso_salvar'      => ['recursos', [R]],
    'recurso_julgar'      => ['recursos', [V]],

    'financeiro_filtros'  => ['financeiro', [V]],
    'financeiro_relatorio' => ['financeiro', [V]],
    'auditoria_listar'    => ['financeiro', [V]],

    'homologacao_estado'  => ['homologacao', '*'],
    'homologacao_data'    => ['homologacao', '*'],
    'homologacao_restaurar' => ['homologacao', '*'],
    'homologacao_banco'   => ['homologacao', '*'],

    'site_concursos'      => ['site', null],
    'site_concurso'       => ['site', null],
    'site_locais'         => ['site', null],
    'site_vagas'          => ['site', null],
    'site_cartao'         => ['site', null],
    'site_gabarito'       => ['site', null],
    'site_parcial'        => ['site', null],
    'site_final'          => ['site', null],
];

try {
    $acao = (string)($_GET['a'] ?? '');
    if (!isset($rotas[$acao])) {
        falha('Ação desconhecida.', 404);
    }
    [$arquivo, $perfis] = $rotas[$acao];
    iniciarSessao();
    if ($perfis !== null) {
        exigirPerfil($perfis);
    }
    require __DIR__ . "/handlers/$arquivo.php";
    $resultado = ('acao_' . $acao)(entrada());
    responder(['ok' => true] + ($resultado ?? []));
} catch (ApiErro $e) {
    responder(['ok' => false, 'mensagem' => $e->getMessage()], $e->http);
} catch (Throwable $e) {
    responder(['ok' => false, 'mensagem' => 'Erro interno: ' . $e->getMessage()], 500);
}
