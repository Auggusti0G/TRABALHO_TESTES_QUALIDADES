<?php
/**
 * Configuração do SGCP – AAG Seleções.
 *
 * Banco de dados: por padrão MySQL/MariaDB do XAMPP (usuário root, sem senha).
 * O banco "aag_selecoes" e as tabelas são criados automaticamente no primeiro acesso.
 * Para rodar sem MySQL, defina a variável de ambiente SGCP_DB_DRIVER=sqlite.
 */
return [
    'db' => [
        'driver' => getenv('SGCP_DB_DRIVER') ?: 'mysql',
        'host'   => getenv('SGCP_DB_HOST') ?: '127.0.0.1',
        'port'   => getenv('SGCP_DB_PORT') ?: '3306',
        'name'   => getenv('SGCP_DB_NAME') ?: 'aag_selecoes',
        'user'   => getenv('SGCP_DB_USER') ?: 'root',
        'pass'   => getenv('SGCP_DB_PASS') ?: '',
        'sqlite' => __DIR__ . '/../database/sgcp.sqlite',
    ],

    // Ambiente de homologação: libera o ajuste da data do sistema e a restauração
    // da massa de dados (exigidos pelo Plano de Teste – Artefato 03).
    // Em produção, altere para false.
    'homologacao' => true,

    // RNF001 – Segurança
    'sessao_minutos'   => 20,
    'max_tentativas'   => 3,
    'bloqueio_minutos' => 15,

    // RNF009 – Arquivos de retorno dos bancos conveniados (database/bancos)
    'bancos' => [
        'Banco A' => 'banco_a.csv',
        'Banco B' => 'banco_b.csv',
    ],
];
