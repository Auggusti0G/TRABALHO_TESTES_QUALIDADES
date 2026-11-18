<?php
/** UC04 – Cadastrar Candidato (RF007, RF008, RF009). */

/** E2 – verifica o prazo: até 5 dias após o término das inscrições. */
function verificarPrazoCadastro(array $concurso): void
{
    if (hoje() > limiteCadastro($concurso)) {
        falha('Prazo para cadastramento de candidatos encerrado.');
    }
    if (hoje() < $concurso['inicio_inscricoes']) {
        falha('Inscrições ainda não iniciadas. Início em ' . dataBr($concurso['inicio_inscricoes']) . '.');
    }
}

function acao_candidato_prazo(array $in): array
{
    $c = concursoOuFalha((int)($in['concurso_id'] ?? 0));
    verificarPrazoCadastro($c);
    return ['limite' => limiteCadastro($c)];
}

/** RF009 – número de inscrição único e sequencial: AAAA + 6 dígitos. */
function proximaInscricao(array $concurso): string
{
    $ano = substr($concurso['inicio_inscricoes'], 0, 4);
    $ultima = valor('SELECT MAX(inscricao) FROM candidatos WHERE inscricao LIKE ?', ["$ano%"]);
    $seq = $ultima ? (int)substr((string)$ultima, 4) + 1 : 1;
    return sprintf('%s%06d', $ano, $seq);
}

function acao_candidato_salvar(array $in): array
{
    $conc = concursoOuFalha((int)($in['concurso_id'] ?? 0));
    verificarPrazoCadastro($conc);

    // E1 – campos obrigatórios
    $nome = obrigatorio($in, 'nome', 'Nome');
    $cpf = soDigitos(obrigatorio($in, 'cpf', 'CPF'));
    $nasc = dataObrigatoria($in, 'nascimento', 'Data de nascimento');
    $sexo = strtoupper(obrigatorio($in, 'sexo', 'Sexo'));
    $logradouro = obrigatorio($in, 'logradouro', 'Logradouro');
    $numero = obrigatorio($in, 'numero', 'Número');
    $bairro = obrigatorio($in, 'bairro', 'Bairro');
    $cep = soDigitos(obrigatorio($in, 'cep', 'CEP'));
    $cidade = obrigatorio($in, 'cidade', 'Cidade');
    $uf = strtoupper(obrigatorio($in, 'uf', 'UF'));
    $telefone = soDigitos(obrigatorio($in, 'telefone', 'Telefone'));
    $email = obrigatorio($in, 'email', 'E-mail');
    $cargoId = (int)obrigatorio($in, 'cargo_id', 'Cargo');
    $locId = (int)obrigatorio($in, 'localidade_id', 'Localidade');
    $pcd = !empty($in['pcd']) && $in['pcd'] !== '0' ? 1 : 0;
    // A1 – candidato deficiente físico: "Qual deficiência" passa a ser obrigatório
    $deficiencia = $pcd ? obrigatorio($in, 'deficiencia', 'Qual deficiência') : null;

    // RNF006 – validação de formatos
    if (!in_array($sexo, ['F', 'M'], true)) {
        falha('Sexo inválido.');
    }
    if ($nasc >= hoje()) {
        falha('Data de nascimento inválida.');
    }
    if (strlen($cep) !== 8) {
        falha('CEP inválido. Use o formato 00000-000.');
    }
    if (!preg_match('/^[A-Z]{2}$/', $uf)) {
        falha('UF inválida. Informe a sigla com duas letras.');
    }
    if (strlen($telefone) < 10 || strlen($telefone) > 11) {
        falha('Telefone inválido. Use o formato (00) 00000-0000.');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        falha('E-mail inválido.');
    }
    $loc = um('SELECT l.* FROM localidades l JOIN cargos g ON g.id = l.cargo_id WHERE l.id = ? AND g.id = ? AND g.concurso_id = ?',
        [$locId, $cargoId, $conc['id']]);
    if (!$loc) {
        falha('Cargo ou localidade não pertence ao concurso selecionado.');
    }
    // E3 – CPF inválido ou já cadastrado no concurso (RNF007)
    if (!cpfValido($cpf) || um('SELECT id FROM candidatos WHERE concurso_id = ? AND cpf = ?', [$conc['id'], $cpf])) {
        falha('CPF inválido ou já cadastrado neste concurso.');
    }

    $inscricao = transacao(function () use ($conc, $cargoId, $locId, $nome, $cpf, $nasc, $sexo, $logradouro, $numero, $bairro,
        $cep, $cidade, $uf, $telefone, $email, $pcd, $deficiencia, $in) {
        $insc = proximaInscricao($conc);
        inserir('candidatos', [
            'concurso_id' => $conc['id'], 'cargo_id' => $cargoId, 'localidade_id' => $locId, 'inscricao' => $insc,
            'nome' => $nome, 'cpf' => $cpf, 'nascimento' => $nasc, 'sexo' => $sexo, 'logradouro' => $logradouro,
            'numero' => $numero, 'complemento' => campo($in, 'complemento') ?: null, 'bairro' => $bairro, 'cep' => $cep,
            'cidade' => $cidade, 'uf' => $uf, 'telefone' => $telefone,
            'telefone2' => soDigitos(campo($in, 'telefone2')) ?: null, 'email' => $email,
            'pcd' => $pcd, 'deficiencia' => $deficiencia,
        ]);
        return $insc;
    });

    return ['mensagem' => "Candidato cadastrado. Inscrição nº $inscricao.", 'inscricao' => $inscricao, 'concorre_pcd' => (bool)$pcd];
}

function acao_candidatos_listar(array $in): array
{
    $busca = '%' . campo($in, 'busca') . '%';
    $lista = todos('SELECT c.id, c.inscricao, c.nome, c.cpf, c.nascimento, c.sexo, c.email, c.telefone, c.pcd, c.deficiencia,
                           c.situacao, c.motivo, g.nome AS cargo, l.municipio, l.uf AS uf_localidade
                    FROM candidatos c JOIN cargos g ON g.id = c.cargo_id JOIN localidades l ON l.id = c.localidade_id
                    WHERE c.concurso_id = ? AND (c.nome LIKE ? OR c.inscricao LIKE ? OR c.cpf LIKE ?)
                    ORDER BY c.inscricao', [(int)($in['concurso_id'] ?? 0), $busca, $busca, $busca]);
    return ['candidatos' => $lista];
}
