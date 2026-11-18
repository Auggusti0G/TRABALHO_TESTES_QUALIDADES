-- SGCP – Sistema de Gestão de Concursos Públicos (AAG Seleções)
-- Esquema do banco de dados (MySQL/MariaDB – XAMPP).
-- O instalador (api/lib/db.php) executa este arquivo automaticamente na primeira
-- execução e o adapta para SQLite quando SGCP_DB_DRIVER=sqlite.

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  login VARCHAR(60) NOT NULL UNIQUE,
  nome VARCHAR(120) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  perfil VARCHAR(20) NOT NULL,
  tentativas INT NOT NULL DEFAULT 0,
  bloqueado_ate DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE config (
  chave VARCHAR(60) NOT NULL PRIMARY KEY,
  valor VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE concursos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa VARCHAR(160) NOT NULL,
  edital VARCHAR(30) NOT NULL,
  data_publicacao DATE NOT NULL,
  taxa DECIMAL(10,2) NOT NULL,
  inicio_inscricoes DATE NOT NULL,
  termino_inscricoes DATE NOT NULL,
  pct_min_conjunto DECIMAL(5,2) NOT NULL,
  correcao_em DATETIME NULL,
  UNIQUE (empresa, edital)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cargos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  concurso_id INT NOT NULL,
  nome VARCHAR(120) NOT NULL,
  FOREIGN KEY (concurso_id) REFERENCES concursos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE localidades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cargo_id INT NOT NULL,
  uf CHAR(2) NOT NULL,
  municipio VARCHAR(120) NOT NULL,
  vagas INT NOT NULL,
  vagas_pcd INT NOT NULL DEFAULT 0,
  FOREIGN KEY (cargo_id) REFERENCES cargos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE provas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cargo_id INT NOT NULL,
  codigo VARCHAR(5) NOT NULL,
  tipo VARCHAR(12) NOT NULL,
  area VARCHAR(120) NOT NULL,
  q_inicial INT NULL,
  q_final INT NULL,
  peso DECIMAL(5,2) NOT NULL,
  carater CHAR(1) NOT NULL,
  data_realizacao DATE NOT NULL,
  pct_min DECIMAL(5,2) NOT NULL DEFAULT 0,
  ordem_desempate INT NULL,
  FOREIGN KEY (cargo_id) REFERENCES cargos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE questoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prova_id INT NOT NULL,
  numero INT NOT NULL,
  pontuacao DECIMAL(6,2) NOT NULL,
  gabarito CHAR(1) NULL,
  anulada INT NOT NULL DEFAULT 0,
  UNIQUE (prova_id, numero),
  FOREIGN KEY (prova_id) REFERENCES provas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE candidatos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  concurso_id INT NOT NULL,
  cargo_id INT NOT NULL,
  localidade_id INT NOT NULL,
  inscricao VARCHAR(12) NOT NULL UNIQUE,
  nome VARCHAR(160) NOT NULL,
  cpf CHAR(11) NOT NULL,
  nascimento DATE NOT NULL,
  sexo CHAR(1) NOT NULL,
  logradouro VARCHAR(160) NOT NULL,
  numero VARCHAR(20) NOT NULL,
  complemento VARCHAR(80) NULL,
  bairro VARCHAR(100) NOT NULL,
  cep CHAR(8) NOT NULL,
  cidade VARCHAR(120) NOT NULL,
  uf CHAR(2) NOT NULL,
  telefone VARCHAR(20) NOT NULL,
  telefone2 VARCHAR(20) NULL,
  email VARCHAR(160) NOT NULL,
  pcd INT NOT NULL DEFAULT 0,
  deficiencia VARCHAR(160) NULL,
  situacao VARCHAR(20) NULL,
  motivo VARCHAR(120) NULL,
  nota_final DECIMAL(8,2) NULL,
  pct_conjunto DECIMAL(6,2) NULL,
  UNIQUE (concurso_id, cpf),
  FOREIGN KEY (concurso_id) REFERENCES concursos(id) ON DELETE CASCADE,
  FOREIGN KEY (cargo_id) REFERENCES cargos(id),
  FOREIGN KEY (localidade_id) REFERENCES localidades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE locais (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prova_id INT NOT NULL,
  localidade_id INT NOT NULL,
  local VARCHAR(160) NOT NULL,
  endereco VARCHAR(200) NOT NULL,
  sala VARCHAR(30) NOT NULL,
  capacidade INT NOT NULL,
  horario CHAR(5) NOT NULL,
  FOREIGN KEY (prova_id) REFERENCES provas(id) ON DELETE CASCADE,
  FOREIGN KEY (localidade_id) REFERENCES localidades(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE alocacoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidato_id INT NOT NULL,
  prova_id INT NOT NULL,
  local_id INT NOT NULL,
  UNIQUE (candidato_id, prova_id),
  FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE CASCADE,
  FOREIGN KEY (prova_id) REFERENCES provas(id) ON DELETE CASCADE,
  FOREIGN KEY (local_id) REFERENCES locais(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE aplicacoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidato_id INT NOT NULL,
  prova_id INT NOT NULL,
  situacao CHAR(1) NOT NULL,
  respostas TEXT NULL,
  nota DECIMAL(5,2) NULL,
  pontos DECIMAL(8,2) NULL,
  UNIQUE (candidato_id, prova_id),
  FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE CASCADE,
  FOREIGN KEY (prova_id) REFERENCES provas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE recursos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  candidato_id INT NOT NULL,
  prova_id INT NOT NULL,
  questao INT NOT NULL,
  situacao VARCHAR(40) NOT NULL,
  nova_alternativa CHAR(1) NULL,
  criado_em DATETIME NOT NULL,
  criado_por VARCHAR(60) NOT NULL,
  julgado_em DATETIME NULL,
  julgado_por VARCHAR(60) NULL,
  FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE CASCADE,
  FOREIGN KEY (prova_id) REFERENCES provas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE auditoria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(60) NOT NULL,
  data_hora DATETIME NOT NULL,
  acao VARCHAR(60) NOT NULL,
  detalhe VARCHAR(255) NULL,
  valor_anterior TEXT NULL,
  valor_novo TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
