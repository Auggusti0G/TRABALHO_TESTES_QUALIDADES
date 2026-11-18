<?php
/**
 * Massa de dados de referência do Plano de Teste (Artefato 03):
 * concurso Edital nº 01/2026 da Companhia de Saneamento do Planalto – CSP,
 * cargo Analista de Sistemas, provas P1 a P4.
 *
 * Níveis:
 *   0 – somente os usuários de teste (banco vazio)           → CT02.x
 *   1 – usuários + concurso, cargo, localidades e provas      → CT03.x a CT05.x, CT09.4
 *   2 – massa completa (candidatos, locais, gabaritos, notas) → CT06.x a CT11.x
 */

require_once __DIR__ . '/regras.php';

/** Gera um CPF válido a partir de 9 dígitos-base. */
function cpfDeBase(string $base): string
{
    for ($t = 9; $t < 11; $t++) {
        $soma = 0;
        for ($i = 0; $i < $t; $i++) {
            $soma += (int)$base[$i] * (($t + 1) - $i);
        }
        $base .= ((10 * $soma) % 11) % 10;
    }
    return $base;
}

function carregarMassa(PDO $pdo, int $nivel): void
{
    // Usuários de teste (não devem ser alterados ou excluídos – Artefato 03)
    $hash = password_hash('Sup@2026', PASSWORD_DEFAULT);
    foreach ([
        ['ds.teste', 'Operador de Seleção (teste)', 'SELECAO'],
        ['dr.teste', 'Operador de Resultados (teste)', 'RESULTADOS'],
        ['supervisor.teste', 'Supervisor de Seleção (teste)', 'SUPERVISOR'],
    ] as [$login, $nome, $perfil]) {
        inserir('usuarios', ['login' => $login, 'nome' => $nome, 'senha_hash' => $hash, 'perfil' => $perfil]);
    }
    configDefinir('nivel_massa', (string)$nivel);
    if ($nivel < 1) {
        return;
    }

    configDefinir('data_sistema', $nivel === 1 ? '2026-01-20' : '2026-03-23');

    $conc = inserir('concursos', [
        'empresa' => 'Companhia de Saneamento do Planalto – CSP', 'edital' => '01/2026',
        'data_publicacao' => '2026-01-05', 'taxa' => 85.00,
        'inicio_inscricoes' => '2026-01-12', 'termino_inscricoes' => '2026-02-11', 'pct_min_conjunto' => 30,
    ]);
    $cargo = inserir('cargos', ['concurso_id' => $conc, 'nome' => 'Analista de Sistemas']);
    $rj = inserir('localidades', ['cargo_id' => $cargo, 'uf' => 'RJ', 'municipio' => 'Rio de Janeiro', 'vagas' => 5, 'vagas_pcd' => 1]);
    $mg = inserir('localidades', ['cargo_id' => $cargo, 'uf' => 'MG', 'municipio' => 'Belo Horizonte', 'vagas' => 10, 'vagas_pcd' => 1]);

    // codigo, tipo, área, q_inicial, q_final, peso, caráter, data, % mínimo, ordem de desempate
    $defs = [
        ['P1', 'OBJETIVA', 'Língua Portuguesa', 1, 20, 1, 'E', '2026-03-15', 20, 3],
        ['P2', 'OBJETIVA', 'Conhecimentos Específicos', 21, 50, 2, 'E', '2026-03-15', 20, 1],
        ['P3', 'DISCURSIVA', 'Redação Técnica', null, null, 2, 'C', '2026-03-22', 0, 2],
        ['P4', 'PRATICA', 'Prática de Informática', null, null, 1, 'E', '2026-03-22', 50, null],
    ];
    $prova = [];
    foreach ($defs as [$cod, $tipo, $area, $qi, $qf, $peso, $car, $data, $min, $ordem]) {
        $prova[$cod] = inserir('provas', [
            'cargo_id' => $cargo, 'codigo' => $cod, 'tipo' => $tipo, 'area' => $area, 'q_inicial' => $qi, 'q_final' => $qf,
            'peso' => $peso, 'carater' => $car, 'data_realizacao' => $data, 'pct_min' => $min, 'ordem_desempate' => $ordem,
        ]);
        if ($tipo === 'OBJETIVA') {
            for ($n = $qi; $n <= $qf; $n++) {
                inserir('questoes', ['prova_id' => $prova[$cod], 'numero' => $n, 'pontuacao' => 1]);
            }
        }
    }
    if ($nivel < 2) {
        return;
    }

    // Gabarito oficial: A,B,C,D,E repetidos (Q1 = A ... Q21 = A ...)
    foreach (['P1', 'P2'] as $cod) {
        foreach (todos('SELECT id, numero FROM questoes WHERE prova_id = ? ORDER BY numero', [$prova[$cod]]) as $i => $qst) {
            q('UPDATE questoes SET gabarito = ? WHERE id = ?', [ALTERNATIVAS[$i % 5], $qst['id']]);
        }
    }

    // nome, cpf, nascimento, sexo, localidade, cidade/uf, pcd, deficiência, [acertos P1, acertos P2, nota P3, nota P4]
    $cands = [
        ['Maria Fernanda Souza', '12345678909', '1995-03-14', 'F', $rj, 0, null, [16, 24, 8.0, 7.0]],
        ['João Pedro Lima', '98765432100', '1990-08-02', 'M', $mg, 0, null, null],
        ['Carlos Henrique Alves', '11144477735', '1988-11-23', 'M', $mg, 1, 'Deficiência física – membro inferior', [3, 20, 6.0, 6.0]],
        ['Bruno Martins Rocha', cpfDeBase('222333444'), '1993-06-30', 'M', $rj, 0, null, [5, 7, 3.0, 5.0]],
        ['Carlos Eduardo Nunes', cpfDeBase('333444555'), '1987-01-17', 'M', $rj, 0, null, [10, 26, 6.0, 6.0]],
        ['Paula Regina Castro', cpfDeBase('444555666'), '1991-12-05', 'F', $rj, 0, null, [10, 24, 8.0, 6.0]],
        ['Rita de Cássia Moura', cpfDeBase('555666777'), '1980-05-10', 'F', $rj, 0, null, [12, 24, 7.0, 6.0]],
        ['Lucas Gabriel Teixeira', cpfDeBase('666777888'), '1992-09-22', 'M', $rj, 0, null, [12, 24, 7.0, 6.0]],
        ['Ana Beatriz Carvalho', cpfDeBase('777888999'), '1996-04-08', 'F', $rj, 0, null, [13, 22, 6.0, 6.0]],
    ];
    $salas = [];
    $horarios = ['P1' => '08:00', 'P2' => '14:00', 'P3' => '08:00', 'P4' => '14:00'];
    foreach ($prova as $cod => $pid) {
        $salas[$cod][$rj] = inserir('locais', ['prova_id' => $pid, 'localidade_id' => $rj, 'local' => 'Colégio Estadual Central',
            'endereco' => 'Av. Presidente Vargas, 1000 – Centro – Rio de Janeiro/RJ', 'sala' => '101', 'capacidade' => 40, 'horario' => $horarios[$cod]]);
        $salas[$cod][$mg] = inserir('locais', ['prova_id' => $pid, 'localidade_id' => $mg, 'local' => 'Escola Municipal Afonso Pena',
            'endereco' => 'Av. Afonso Pena, 1500 – Centro – Belo Horizonte/MG', 'sala' => '201', 'capacidade' => 40, 'horario' => $horarios[$cod]]);
    }

    foreach ($cands as $i => [$nome, $cpf, $nasc, $sexo, $loc, $pcd, $def, $desempenho]) {
        $rio = $loc === $rj;
        $id = inserir('candidatos', [
            'concurso_id' => $conc, 'cargo_id' => $cargo, 'localidade_id' => $loc,
            'inscricao' => sprintf('2026%06d', $i + 1), 'nome' => $nome, 'cpf' => $cpf, 'nascimento' => $nasc, 'sexo' => $sexo,
            'logradouro' => $rio ? 'Rua das Acácias' : 'Rua dos Inconfidentes', 'numero' => (string)(120 + $i * 7),
            'complemento' => $i % 2 ? null : 'apto ' . (301 + $i), 'bairro' => 'Centro',
            'cep' => $rio ? '20010000' : '30140120', 'cidade' => $rio ? 'Rio de Janeiro' : 'Belo Horizonte', 'uf' => $rio ? 'RJ' : 'MG',
            'telefone' => ($rio ? '219' : '319') . sprintf('%08d', 98765432 - $i * 1111),
            'email' => strtolower(strtr(explode(' ', $nome)[0], ['ã' => 'a', 'é' => 'e'])) . ($i + 1) . '@email.com',
            'pcd' => $pcd, 'deficiencia' => $def,
        ]);
        foreach ($prova as $cod => $pid) {
            inserir('alocacoes', ['candidato_id' => $id, 'prova_id' => $pid, 'local_id' => $salas[$cod][$loc]]);
        }
        if ($desempenho === null) {
            continue; // sem registro de aplicação (usado nos casos CT06.1 e CT06.4)
        }
        foreach (['P1' => $desempenho[0], 'P2' => $desempenho[1]] as $cod => $acertos) {
            $qs = todos('SELECT numero, gabarito FROM questoes WHERE prova_id = ? ORDER BY numero', [$prova[$cod]]);
            $resp = [];
            foreach ($qs as $k => $qst) {
                // as últimas $acertos questões estão corretas; nas demais o candidato marcou duas letras adiante
                $certa = $k >= count($qs) - $acertos;
                $resp[$qst['numero']] = $certa ? $qst['gabarito'] : ALTERNATIVAS[(array_search($qst['gabarito'], ALTERNATIVAS) + 2) % 5];
            }
            inserir('aplicacoes', ['candidato_id' => $id, 'prova_id' => $prova[$cod], 'situacao' => 'P', 'respostas' => json_encode($resp)]);
        }
        inserir('aplicacoes', ['candidato_id' => $id, 'prova_id' => $prova['P3'], 'situacao' => 'P', 'nota' => $desempenho[2]]);
        inserir('aplicacoes', ['candidato_id' => $id, 'prova_id' => $prova['P4'], 'situacao' => 'P', 'nota' => $desempenho[3]]);
    }

    corrigirConcurso($conc);
    auditar('MASSA_DE_DADOS', 'Massa de dados de referência carregada (nível 2) – gabarito oficial e correção iniciais.');
}
