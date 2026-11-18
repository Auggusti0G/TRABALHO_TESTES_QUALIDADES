<?php
/** Sessão, perfis e controle de acesso (RF001 / RNF001). */

const PERFIS = [
    'SELECAO'    => 'Departamento de Seleção',
    'RESULTADOS' => 'Departamento de Resultados',
    'SUPERVISOR' => 'Supervisor de Seleção',
];

function iniciarSessao(): void
{
    session_name('SGCPSESSID');
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
    session_start();
    // RNF001: a sessão expira após 20 minutos sem uso
    if (isset($_SESSION['usuario'])) {
        $limite = cfg()['sessao_minutos'] * 60;
        if (time() - ($_SESSION['ultimo_acesso'] ?? 0) > $limite) {
            $_SESSION = [];
            $_SESSION['expirou'] = true;
        } else {
            $_SESSION['ultimo_acesso'] = time();
        }
    }
}

function usuarioAtual(): ?array
{
    return $_SESSION['usuario'] ?? null;
}

/** @param array|string $perfis lista de perfis autorizados ou '*' */
function exigirPerfil(array|string $perfis): void
{
    $u = usuarioAtual();
    if (!$u) {
        $msg = !empty($_SESSION['expirou']) ? 'Sessão expirada. Efetue o login novamente.' : 'Efetue o login para continuar.';
        falha($msg, 401);
    }
    if ($perfis === '*' || in_array($u['perfil'], $perfis, true)) {
        return;
    }
    if ($perfis === ['SUPERVISOR']) {
        falha('Acesso restrito ao Supervisor de Seleção.', 403);
    }
    $nomes = array_map(fn($p) => PERFIS[$p], $perfis);
    falha('Acesso restrito ao ' . implode(' e ao ', $nomes) . '.', 403);
}
