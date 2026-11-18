<?php
/** Conexão PDO, instalação automática do esquema e acesso simplificado ao banco. */

function cfg(): array
{
    static $c = null;
    return $c ??= require __DIR__ . '/../config.php';
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $c = cfg()['db'];
    $opt = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_STRINGIFY_FETCHES  => false,
    ];
    try {
        if ($c['driver'] === 'sqlite') {
            $pdo = new PDO('sqlite:' . $c['sqlite'], null, null, $opt);
            $pdo->exec('PRAGMA foreign_keys = ON');
        } else {
            $pdo = new PDO("mysql:host={$c['host']};port={$c['port']};charset=utf8mb4", $c['user'], $c['pass'], $opt);
            $nome = preg_replace('/\W/', '', $c['name']);
            $pdo->exec("CREATE DATABASE IF NOT EXISTS `$nome` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $pdo->exec("USE `$nome`");
        }
    } catch (PDOException $e) {
        falha('Não foi possível conectar ao banco de dados. Inicie o MySQL no XAMPP '
            . '(ou defina SGCP_DB_DRIVER=sqlite). Detalhe: ' . $e->getMessage(), 500);
    }
    if (!tabelaExiste($pdo, 'usuarios')) {
        criarEsquema($pdo);
        require_once __DIR__ . '/seed.php';
        carregarMassa($pdo, 2);
    }
    return $pdo;
}

function tabelaExiste(PDO $pdo, string $tabela): bool
{
    try {
        $pdo->query("SELECT 1 FROM $tabela LIMIT 1");
        return true;
    } catch (PDOException $e) {
        return false;
    }
}

function tabelas(): array
{
    return ['auditoria', 'recursos', 'aplicacoes', 'alocacoes', 'locais', 'candidatos', 'questoes',
        'provas', 'localidades', 'cargos', 'concursos', 'config', 'usuarios'];
}

/** Executa database/schema.sql (adaptando a sintaxe quando o driver é SQLite). */
function criarEsquema(PDO $pdo): void
{
    $sql = file_get_contents(__DIR__ . '/../../database/schema.sql');
    $sql = preg_replace('/^--.*$/m', '', $sql);
    if (cfg()['db']['driver'] === 'sqlite') {
        $sql = str_replace('INT AUTO_INCREMENT PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT', $sql);
        $sql = str_replace(' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', '', $sql);
    }
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
        $pdo->exec($stmt);
    }
}

function removerEsquema(PDO $pdo): void
{
    foreach (tabelas() as $t) {
        $pdo->exec("DROP TABLE IF EXISTS $t");
    }
}

/* ---------- atalhos de consulta ---------- */

function q(string $sql, array $p = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st;
}

function todos(string $sql, array $p = []): array
{
    return q($sql, $p)->fetchAll();
}

function um(string $sql, array $p = []): ?array
{
    $r = q($sql, $p)->fetch();
    return $r === false ? null : $r;
}

function valor(string $sql, array $p = []): mixed
{
    $r = q($sql, $p)->fetchColumn();
    return $r === false ? null : $r;
}

function inserir(string $tabela, array $dados): int
{
    $cols = array_keys($dados);
    $sql = "INSERT INTO $tabela (" . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
    q($sql, array_values($dados));
    return (int)db()->lastInsertId();
}

function atualizar(string $tabela, array $dados, int $id): void
{
    $set = implode(',', array_map(fn($c) => "$c = ?", array_keys($dados)));
    q("UPDATE $tabela SET $set WHERE id = ?", [...array_values($dados), $id]);
}

function transacao(callable $fn): mixed
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $r = $fn();
        $pdo->commit();
        return $r;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/* ---------- configuração persistida ---------- */

function configObter(string $chave): ?string
{
    $v = valor('SELECT valor FROM config WHERE chave = ?', [$chave]);
    return ($v === null || $v === '') ? null : (string)$v;
}

function configDefinir(string $chave, ?string $v): void
{
    q('DELETE FROM config WHERE chave = ?', [$chave]);
    q('INSERT INTO config (chave, valor) VALUES (?, ?)', [$chave, $v]);
}

/** Data atual do sistema (ajustável em homologação para os testes de prazo). */
function hoje(): string
{
    if (cfg()['homologacao']) {
        $d = configObter('data_sistema');
        if ($d) {
            return $d;
        }
    }
    return date('Y-m-d');
}

/** RNF003 – log de auditoria. */
function auditar(string $acao, string $detalhe, ?string $anterior = null, ?string $novo = null): void
{
    inserir('auditoria', [
        'usuario'        => $_SESSION['usuario']['login'] ?? 'sistema',
        'data_hora'      => agora(),
        'acao'           => $acao,
        'detalhe'        => $detalhe,
        'valor_anterior' => $anterior,
        'valor_novo'     => $novo,
    ]);
}
