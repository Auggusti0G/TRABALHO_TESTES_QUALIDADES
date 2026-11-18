# AAG Seleções – SGCP (Sistema de Gestão de Concursos Públicos)

Projeto da disciplina Teste e Qualidade de Software (CEUB) – Grupo G-02.
Implementa os 26 requisitos funcionais e os 11 casos de uso dos Artefatos 01 e 02.

## Estrutura

```text
aag-selecoes/
│
├── DOCS/          # Documentação do projeto (Artefatos, Planos de Teste, etc.)
├── api/           # API em PHP (index.php é o roteador; handlers/ por caso de uso; lib/ regras e banco)
├── assets/        # CSS e JavaScript
├── database/      # Esquema SQL e arquivos de retorno dos bancos conveniados
├── tests/         # Testes de software (executar_casos_de_teste.py)
│
├── admin.html     # Módulo administrativo (UC01 a UC08 e UC11)
├── index.html     # Site do candidato (UC09 e UC10)
└── README.md      # Documentação e instruções do projeto

## Tecnologias
HTML, CSS e JavaScript (sem frameworks) no front-end; PHP 8 + PDO no back-end; banco MySQL/MariaDB (XAMPP) ou SQLite.

## Como executar (XAMPP)
1. Copie a pasta do projeto para `C:\xampp\htdocs\aag-selecoes`.
2. Inicie o Apache e o MySQL no painel do XAMPP.
3. Acesse `http://localhost/aag-selecoes/` (site do candidato) ou `http://localhost/aag-selecoes/admin.html` (módulo administrativo).

O banco `aag_selecoes`, as tabelas (`database/schema.sql`) e a massa de dados de referência são criados automaticamente no primeiro acesso.
Sem MySQL: defina `SGCP_DB_DRIVER=sqlite` e rode `php -S localhost:8000`.

## Usuários de teste (Artefato 03)
`ds.teste` (Departamento de Seleção), `dr.teste` (Departamento de Resultados) e `supervisor.teste` (Supervisor de Seleção). A senha está definida no Plano de Teste.

## Estrutura
- `index.html` – site do candidato (UC09 e UC10)
- `admin.html` – módulo administrativo (UC01 a UC08 e UC11)
- `assets/` – CSS e JavaScript
- `api/` – API em PHP (`index.php` é o roteador; `handlers/` por caso de uso; `lib/` regras e banco)
- `database/` – esquema SQL e arquivos de retorno dos bancos conveniados
- `tests/executar_casos_de_teste.py` – executa os casos de teste do Artefato 06 contra a API

## Testes
```
python tests/executar_casos_de_teste.py http://localhost/aag-selecoes/api/index.php
```
O script restaura a massa de dados (apaga os dados atuais). Em Sistema > Homologação é possível ajustar a data do sistema e restaurar a massa manualmente.

## Documentação (`docs/`)
- `docs/artefatos/` – Artefatos 01 a 06 (requisitos, casos de uso e artefatos de teste) e o Artefato 07, que descreve cada funcionalidade do sistema no template do CEUB (Word e PDF).
- `docs/referencia/` – estudo de caso e template do TCD fornecidos pelo professor.
