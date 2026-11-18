<?php
/** Funções utilitárias da API do SGCP. */

class ApiErro extends Exception
{
    public int $http;
    public function __construct(string $msg, int $http = 422)
    {
        parent::__construct($msg);
        $this->http = $http;
    }
}

function falha(string $msg, int $http = 422): never
{
    throw new ApiErro($msg, $http);
}

function responder(array $dados, int $http = 200): never
{
    http_response_code($http);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Corpo JSON da requisição (ou parâmetros GET). */
function entrada(): array
{
    static $in = null;
    if ($in === null) {
        $json = json_decode(file_get_contents('php://input') ?: '', true);
        $in = array_merge($_GET, is_array($json) ? $json : []);
    }
    return $in;
}

function campo(array $d, string $nome): string
{
    return trim((string)($d[$nome] ?? ''));
}

/** E1 – Campo obrigatório não informado. */
function obrigatorio(array $d, string $nome, string $rotulo): string
{
    $v = campo($d, $nome);
    if ($v === '') {
        falha("Campo obrigatório não informado: $rotulo.");
    }
    return $v;
}

/** Converte DD/MM/AAAA (ou AAAA-MM-DD) em AAAA-MM-DD; null se inválida. */
function dataIso(string $s): ?string
{
    $s = trim($s);
    if (preg_match('#^(\d{2})/(\d{2})/(\d{4})$#', $s, $m)) {
        [$d, $mes, $a] = [(int)$m[1], (int)$m[2], (int)$m[3]];
    } elseif (preg_match('#^(\d{4})-(\d{2})-(\d{2})$#', $s, $m)) {
        [$a, $mes, $d] = [(int)$m[1], (int)$m[2], (int)$m[3]];
    } else {
        return null;
    }
    return checkdate($mes, $d, $a) ? sprintf('%04d-%02d-%02d', $a, $mes, $d) : null;
}

function dataObrigatoria(array $d, string $nome, string $rotulo): string
{
    $iso = dataIso(obrigatorio($d, $nome, $rotulo));
    if ($iso === null) {
        falha("Data inválida no campo $rotulo. Use o formato DD/MM/AAAA.");
    }
    return $iso;
}

function dataBr(?string $iso): string
{
    return $iso ? date('d/m/Y', strtotime($iso)) : '';
}

function somaDias(string $iso, int $dias): string
{
    return date('Y-m-d', strtotime("$iso +$dias days"));
}

/** Converte "1.234,56" / "85,00" / "85.5" em float; null se inválido. */
function numero(string $s): ?float
{
    $s = trim(str_replace(['R$', ' '], '', $s));
    if ($s === '') {
        return null;
    }
    if (str_contains($s, ',')) {
        $s = str_replace(',', '.', str_replace('.', '', $s));
    }
    return is_numeric($s) ? (float)$s : null;
}

function numeroObrigatorio(array $d, string $nome, string $rotulo): float
{
    $n = numero(obrigatorio($d, $nome, $rotulo));
    if ($n === null) {
        falha("Valor numérico inválido no campo $rotulo.");
    }
    return $n;
}

function inteiroObrigatorio(array $d, string $nome, string $rotulo): int
{
    $v = obrigatorio($d, $nome, $rotulo);
    if (!preg_match('/^\d+$/', $v)) {
        falha("Valor numérico inválido no campo $rotulo.");
    }
    return (int)$v;
}

function soDigitos(string $s): string
{
    return preg_replace('/\D/', '', $s);
}

/** Valida os dígitos verificadores do CPF. */
function cpfValido(string $cpf): bool
{
    $cpf = soDigitos($cpf);
    if (strlen($cpf) !== 11 || preg_match('/^(\d)\1{10}$/', $cpf)) {
        return false;
    }
    for ($t = 9; $t < 11; $t++) {
        $soma = 0;
        for ($i = 0; $i < $t; $i++) {
            $soma += (int)$cpf[$i] * (($t + 1) - $i);
        }
        $dig = ((10 * $soma) % 11) % 10;
        if ((int)$cpf[$t] !== $dig) {
            return false;
        }
    }
    return true;
}

/** LGPD (RNF002): CPF mascarado para exibição em listagens públicas. */
function cpfMascarado(string $cpf): string
{
    return '***.' . substr($cpf, 3, 3) . '.' . substr($cpf, 6, 3) . '-**';
}

function pctTexto(float $p): string
{
    return rtrim(rtrim(number_format($p, 2, ',', ''), '0'), ',');
}

function agora(): string
{
    return date('Y-m-d H:i:s');
}
