<?php
/** UC01 – Efetuar Login (RF001, RNF001). */

function dadosSessao(): array
{
    $u = usuarioAtual();
    return [
        'usuario'     => $u ? $u + ['perfil_nome' => PERFIS[$u['perfil']]] : null,
        'hoje'        => hoje(),
        'data_real'   => date('Y-m-d'),
        'homologacao' => cfg()['homologacao'],
    ];
}

function acao_sessao(array $in): array
{
    return dadosSessao();
}

function acao_login(array $in): array
{
    $login = campo($in, 'login');
    $senha = (string)($in['senha'] ?? '');
    // E1 – campo obrigatório não informado
    if ($login === '' || $senha === '') {
        falha('Informe o login e a senha.');
    }
    $u = um('SELECT * FROM usuarios WHERE login = ?', [$login]);
    // E2 – credenciais inválidas (mesma mensagem para login inexistente e senha incorreta)
    if (!$u) {
        falha('Login ou senha inválidos.', 401);
    }
    if ($u['bloqueado_ate'] && $u['bloqueado_ate'] > agora()) {
        falha('Usuário bloqueado por excesso de tentativas inválidas. Tente novamente após '
            . date('H:i', strtotime($u['bloqueado_ate'])) . '.', 403);
    }
    if (!password_verify($senha, $u['senha_hash'])) {
        $tent = ($u['bloqueado_ate'] ? 0 : (int)$u['tentativas']) + 1;
        $c = cfg();
        if ($tent >= $c['max_tentativas']) {
            // RNF001: bloqueio de 15 minutos após 3 tentativas inválidas consecutivas
            atualizar('usuarios', ['tentativas' => 0,
                'bloqueado_ate' => date('Y-m-d H:i:s', time() + $c['bloqueio_minutos'] * 60)], (int)$u['id']);
            falha("Login ou senha inválidos. Usuário bloqueado por {$c['bloqueio_minutos']} minutos.", 401);
        }
        atualizar('usuarios', ['tentativas' => $tent, 'bloqueado_ate' => null], (int)$u['id']);
        falha('Login ou senha inválidos.', 401);
    }
    atualizar('usuarios', ['tentativas' => 0, 'bloqueado_ate' => null], (int)$u['id']);
    session_regenerate_id(true);
    $_SESSION = [
        'usuario'       => ['login' => $u['login'], 'nome' => $u['nome'], 'perfil' => $u['perfil']],
        'ultimo_acesso' => time(),
    ];
    return dadosSessao() + ['mensagem' => 'Bem-vindo, ' . PERFIS[$u['perfil']] . '.'];
}

function acao_logout(array $in): array
{
    $_SESSION = [];
    session_destroy();
    return ['mensagem' => 'Sessão encerrada.'];
}
