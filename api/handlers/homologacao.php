<?php
/**
 * Ferramentas do ambiente de homologação exigidas pelo Plano de Teste (Artefato 03):
 * data do sistema ajustável, restauração da massa de dados de referência e simulação
 * de indisponibilidade de banco conveniado. Desativadas quando 'homologacao' => false.
 */

function exigirHomologacao(): void
{
    if (!cfg()['homologacao']) {
        falha('Recurso disponível somente no ambiente de homologação.', 403);
    }
}

function acao_homologacao_estado(array $in): array
{
    return [
        'homologacao'        => cfg()['homologacao'],
        'hoje'               => hoje(),
        'data_real'          => date('Y-m-d'),
        'data_ajustada'      => configObter('data_sistema'),
        'banco_indisponivel' => configObter('banco_indisponivel'),
        'nivel_massa'        => configObter('nivel_massa'),
        'bancos'             => array_keys(cfg()['bancos']),
        'driver'             => cfg()['db']['driver'],
    ];
}

function acao_homologacao_data(array $in): array
{
    exigirHomologacao();
    $txt = campo($in, 'data');
    if ($txt === '') {
        configDefinir('data_sistema', null);
        return ['mensagem' => 'Data do sistema restaurada para a data real.', 'hoje' => hoje()];
    }
    $iso = dataIso($txt) ?? falha('Data inválida. Use o formato DD/MM/AAAA.');
    configDefinir('data_sistema', $iso);
    return ['mensagem' => 'Data do sistema ajustada para ' . dataBr($iso) . '.', 'hoje' => $iso];
}

function acao_homologacao_restaurar(array $in): array
{
    exigirHomologacao();
    $nivel = (int)($in['nivel'] ?? 2);
    if ($nivel < 0 || $nivel > 2) {
        falha('Nível de massa de dados inválido.');
    }
    $pdo = db();
    $sessao = $_SESSION['usuario'];
    removerEsquema($pdo);
    criarEsquema($pdo);
    require_once __DIR__ . '/../lib/seed.php';
    carregarMassa($pdo, $nivel);
    $_SESSION['usuario'] = $sessao;
    $nomes = ['somente usuários de teste', 'concurso, cargo e provas', 'massa de referência completa'];
    return ['mensagem' => "Banco de dados restaurado ({$nomes[$nivel]}).", 'hoje' => hoje()];
}

function acao_homologacao_banco(array $in): array
{
    exigirHomologacao();
    $banco = campo($in, 'banco');
    if ($banco !== '' && !isset(cfg()['bancos'][$banco])) {
        falha('Banco conveniado inválido.');
    }
    configDefinir('banco_indisponivel', $banco ?: null);
    return ['mensagem' => $banco ? "Serviço do $banco marcado como indisponível." : 'Todos os bancos conveniados disponíveis.'];
}
