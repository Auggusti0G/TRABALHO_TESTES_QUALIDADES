<?php
/** UC11 – Visualizar Relatório Financeiro (RF026, RNF009) e consulta do log de auditoria (RNF003). */

function acao_financeiro_filtros(array $in): array
{
    return ['bancos' => array_keys(cfg()['bancos'])];
}

/**
 * Lê o arquivo de retorno de um banco conveniado (database/bancos/*.csv).
 * Layout: edital;data_pagamento(AAAA-MM-DD);quantidade;valor_unitario
 * E2 – se o arquivo/serviço não estiver disponível, a consulta é interrompida.
 */
function lerBanco(string $banco): array
{
    $arquivo = __DIR__ . '/../../database/bancos/' . cfg()['bancos'][$banco];
    if (configObter('banco_indisponivel') === $banco || !is_readable($arquivo)) {
        falha("Dados do banco $banco indisponíveis. Tente novamente mais tarde.", 503);
    }
    $linhas = [];
    foreach (file($arquivo, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $i => $linha) {
        $col = str_getcsv($linha, ';');
        if ($i === 0 || count($col) < 4) {
            continue; // cabeçalho
        }
        $linhas[] = ['edital' => trim($col[0]), 'data' => trim($col[1]), 'quantidade' => (int)$col[2], 'valor' => (float)$col[3]];
    }
    return $linhas;
}

function acao_financeiro_relatorio(array $in): array
{
    $c = concursoOuFalha((int)($in['concurso_id'] ?? 0));
    $inicio = campo($in, 'inicio') === '' ? null : (dataIso($in['inicio']) ?? falha('Data inválida no campo Período – início. Use o formato DD/MM/AAAA.'));
    $fim = campo($in, 'fim') === '' ? null : (dataIso($in['fim']) ?? falha('Data inválida no campo Período – fim. Use o formato DD/MM/AAAA.'));
    if ($inicio && $fim && $fim < $inicio) {
        falha('Período inválido: a data final é anterior à inicial.');
    }
    $bancos = array_keys(cfg()['bancos']);
    $filtro = campo($in, 'banco');
    if ($filtro !== '') {
        if (!in_array($filtro, $bancos, true)) {
            falha('Banco conveniado inválido.');
        }
        $bancos = [$filtro];
    }

    $linhas = [];
    $totalQtd = 0;
    $totalValor = 0.0;
    foreach ($bancos as $banco) {
        $qtd = 0;
        $val = 0.0;
        foreach (lerBanco($banco) as $pg) {
            if ($pg['edital'] !== $c['edital'] || ($inicio && $pg['data'] < $inicio) || ($fim && $pg['data'] > $fim)) {
                continue;
            }
            $qtd += $pg['quantidade'];
            $val += $pg['quantidade'] * $pg['valor'];
        }
        $linhas[] = ['banco' => $banco, 'inscricoes' => $qtd, 'valor' => round($val, 2)];
        $totalQtd += $qtd;
        $totalValor += $val;
    }
    return ['concurso' => $c, 'linhas' => $linhas,
        'total' => ['inscricoes' => $totalQtd, 'valor' => round($totalValor, 2)],
        'inscritos_cadastrados' => (int)valor('SELECT COUNT(*) FROM candidatos WHERE concurso_id = ?', [$c['id']])];
}

function acao_auditoria_listar(array $in): array
{
    return ['registros' => todos('SELECT * FROM auditoria ORDER BY id DESC LIMIT 200')];
}
