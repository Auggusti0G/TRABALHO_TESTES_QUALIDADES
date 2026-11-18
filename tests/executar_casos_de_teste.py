"""
Execução automatizada dos casos de teste do Artefato 06 (CT01.1 a CT11.3) contra a API do SGCP.

Uso:  python tests/executar_casos_de_teste.py http://localhost/aag-selecoes/api/index.php

ATENÇÃO: o script restaura a massa de dados de referência várias vezes (apaga os dados atuais).
Requer o ambiente de homologação ativo (api/config.php -> 'homologacao' => true).
"""
import copy
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
from urllib.parse import urlencode

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost/aag-selecoes/api/index.php'
SENHA = 'Sup@2026'  # senha dos usuários de teste definida no Plano de Teste (Artefato 03)


class Cliente:
    """Sessão HTTP independente (um navegador por ator)."""

    def __init__(self):
        self.http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def chamar(self, acao, dados=None, **params):
        url = BASE + '?' + urlencode({'a': acao, **params})
        corpo = json.dumps(dados).encode() if dados is not None else None
        req = urllib.request.Request(url, data=corpo, headers={'Content-Type': 'application/json'})
        try:
            return json.load(self.http.open(req))
        except urllib.error.HTTPError as e:
            return json.load(e)

    def login(self, usuario, senha=SENHA):
        return self.chamar('login', {'login': usuario, 'senha': senha})


resultados = []


def ct(ident, resposta, esperado):
    """Verifica se a mensagem emitida pelo sistema é a esperada no caso de teste."""
    msg = resposta.get('mensagem', '')
    ok = esperado in msg
    resultados.append((ident, ok))
    print('APROVADO ' if ok else 'REPROVADO', ident, '|', msg if ok else f'esperado "{esperado}" – obtido: {json.dumps(resposta, ensure_ascii=False)[:300]}')


def verificar(ident, condicao, info=''):
    resultados.append((ident, bool(condicao)))
    print('APROVADO ' if condicao else 'REPROVADO', ident, '|', info)


ds, dr, sv, site = Cliente(), Cliente(), Cliente(), Cliente()

# ------------------------------------------------------------------ UC01 – Efetuar Login
ct('CT01.1', sv.login('supervisor.teste'), 'Bem-vindo, Supervisor de Seleção.')
ct('CT01.2', Cliente().login('supervisor.teste', 'senhaErrada'), 'Login ou senha inválidos.')
ct('CT01.3', Cliente().login('', SENHA), 'Informe o login e a senha.')
sv.login('supervisor.teste')
ds.login('ds.teste')
dr.login('dr.teste')


def data_do_sistema(d):
    sv.chamar('homologacao_data', {'data': d})


def restaurar(nivel):
    sv.chamar('homologacao_restaurar', {'nivel': nivel})


# ------------------------------------------------------------------ UC02 – Concurso (banco vazio)
restaurar(0)
concurso = {
    'empresa': 'Companhia de Saneamento do Planalto – CSP', 'edital': '01/2026', 'data_publicacao': '05/01/2026',
    'taxa': '85,00', 'inicio_inscricoes': '12/01/2026', 'termino_inscricoes': '11/02/2026', 'pct_min_conjunto': '30',
    'cargos': [{'nome': 'Analista de Sistemas', 'localidades': [
        {'uf': 'RJ', 'municipio': 'Rio de Janeiro', 'vagas': '5', 'vagas_pcd': '1'},
        {'uf': 'MG', 'municipio': 'Belo Horizonte', 'vagas': '10', 'vagas_pcd': '1'}]}],
}
c = copy.deepcopy(concurso)
c['cargos'][0]['localidades'] = [{'uf': 'RJ', 'municipio': 'Rio de Janeiro', 'vagas': '5', 'vagas_pcd': '6'}]
ct('CT02.2', ds.chamar('concurso_salvar', c), 'Vagas para deficientes não podem exceder as vagas totais.')
c = copy.deepcopy(concurso)
c['inicio_inscricoes'], c['termino_inscricoes'] = '11/02/2026', '12/01/2026'
ct('CT02.3', ds.chamar('concurso_salvar', c), 'Período de inscrições inválido.')
c = copy.deepcopy(concurso)
c['edital'] = ''
ct('CT02.4', ds.chamar('concurso_salvar', c), 'Campo obrigatório não informado: Nº do edital.')
r = ds.chamar('concurso_salvar', concurso)
ct('CT02.1', r, 'Concurso cadastrado com sucesso.')
verificar('CT02.1 (vagas)', r['concurso']['cargos'][0]['total_vagas'] == 15, 'Total de vagas do cargo: 15')
gravado = r['concurso']
cid = gravado['id']
alterado = {**{k: v for k, v in concurso.items() if k != 'cargos'}, 'id': cid, 'taxa': '90,00', 'cargos': gravado['cargos']}
r = ds.chamar('concurso_salvar', alterado)
ct('CT02.5', r, 'Concurso alterado com sucesso.')
verificar('CT02.5 (taxa)', float(r['concurso']['taxa']) == 90, 'Taxa de inscrição: R$ 90,00')
verificar('CT02.6', len(ds.chamar('concursos_listar')['concursos']) == 1, 'Cancelar não envia dados ao servidor: Edital 02/2026 não listado')
ct('RNF007 (edital único)', ds.chamar('concurso_salvar', concurso), 'Já existe um concurso com este nº de edital')
ct('RF001 (perfil)', dr.chamar('concurso_salvar', concurso), 'Acesso restrito ao Departamento de Seleção.')

# ------------------------------------------------------------------ UC03 – Provas e desempate
cargo = gravado['cargos'][0]['id']


def prova(**k):
    return ds.chamar('prova_salvar', {'cargo_id': cargo, **k})


ct('Pré-condição P1', prova(tipo='OBJETIVA', area='Língua Portuguesa', q_inicial='1', q_final='20', pontuacao='1,0', peso='1',
                            carater='E', data_realizacao='15/03/2026', pct_min='20'), 'Prova cadastrada com sucesso.')
r = prova(tipo='OBJETIVA', area='Conhecimentos Específicos', q_inicial='21', q_final='50', pontuacao='1,0', peso='2',
          carater='E', data_realizacao='15/03/2026', pct_min='20')
ct('CT03.1', r, 'Prova cadastrada com sucesso.')
verificar('CT03.1 (resumo)', r['resumo'] == 'P2 – Objetiva – 30 questões – 30 pontos possíveis', r['resumo'])
ct('Pré-condição P3', prova(tipo='DISCURSIVA', area='Redação Técnica', q_inicial='1', q_final='1', peso='2', carater='C',
                            data_realizacao='22/03/2026', pct_min='0'), 'Prova cadastrada com sucesso.')
r = prova(tipo='PRATICA', area='Prática de Informática', peso='1', carater='E', data_realizacao='22/03/2026', pct_min='50')
ct('CT03.2', r, 'Prova cadastrada com sucesso.')
verificar('CT03.2 (resumo)', r['resumo'] == 'P4 – Prática', r['resumo'])
ct('CT03.3', prova(tipo='OBJETIVA', area='Raciocínio Lógico', q_inicial='20', q_final='1', peso='1', carater='E',
                   data_realizacao='15/03/2026'), 'Número final da questão deve ser maior ou igual ao número inicial.')
ct('CT03.4', prova(tipo='OBJETIVA', area='Raciocínio Lógico', q_inicial='1', q_final='20', peso='1', carater='E',
                   data_realizacao='15/03/2026', pct_min='120'), 'Percentual mínimo deve estar entre 0 e 100.')
ct('CT03.6', prova(tipo='OBJETIVA', area='', q_inicial='1', q_final='20'), 'Campo obrigatório não informado: Área de conhecimento.')
provas = {p['codigo']: p['id'] for p in ds.chamar('provas_listar', cargo_id=cargo)['provas']}
r = ds.chamar('desempate_salvar', {'cargo_id': cargo, 'ordem': [provas['P2'], provas['P3'], provas['P1']]})
ct('CT03.5', r, 'Critérios de desempate gravados com sucesso.')
verificar('CT03.5 (ordem)', r['ordem'] == 'P2, P3, P1, Candidato mais idoso', r['ordem'])

# ------------------------------------------------------------------ UC04 – Candidatos
loc = {l['municipio']: l['id'] for l in gravado['cargos'][0]['localidades']}


def candidato(**k):
    base = {'concurso_id': cid, 'nome': 'Fulano de Tal', 'cpf': '529.982.247-25', 'nascimento': '01/01/1990', 'sexo': 'M',
            'logradouro': 'Rua A', 'numero': '1', 'bairro': 'Centro', 'cep': '20010-000', 'cidade': 'Rio de Janeiro', 'uf': 'RJ',
            'telefone': '(21) 99876-5432', 'email': 'candidato@email.com', 'cargo_id': cargo,
            'localidade_id': loc['Rio de Janeiro'], 'pcd': '0'}
    return ds.chamar('candidato_salvar', {**base, **k})


data_do_sistema('20/01/2026')
ct('CT04.4', candidato(cpf='123.456.789-00'), 'CPF inválido ou já cadastrado neste concurso.')
ct('CT04.5', candidato(pcd='1', deficiencia=''), 'Campo obrigatório não informado: Qual deficiência.')
ct('CT04.1', candidato(nome='Maria Fernanda Souza', cpf='123.456.789-09', nascimento='14/03/1995', sexo='F',
                       logradouro='Rua das Acácias', numero='120', complemento='apto 301', email='maria.souza@email.com'),
   'Candidato cadastrado. Inscrição nº 2026000001.')
ct('RNF007 (CPF duplicado)', candidato(cpf='123.456.789-09'), 'CPF inválido ou já cadastrado neste concurso.')
data_do_sistema('16/02/2026')
ct('CT04.2', candidato(nome='João Pedro Lima', cpf='987.654.321-00', nascimento='02/08/1990', localidade_id=loc['Belo Horizonte']),
   'Candidato cadastrado. Inscrição nº 2026000002.')
data_do_sistema('17/02/2026')
ct('CT04.3', ds.chamar('candidato_prazo', concurso_id=cid), 'Prazo para cadastramento de candidatos encerrado.')
data_do_sistema('25/01/2026')
r = candidato(nome='Carlos Henrique Alves', cpf='111.444.777-35', localidade_id=loc['Belo Horizonte'], pcd='1',
              deficiencia='Deficiência física – membro inferior')
ct('CT04.6', r, 'Candidato cadastrado. Inscrição nº 2026000003.')
verificar('CT04.6 (PcD)', r.get('concorre_pcd') is True, 'Concorre às vagas PcD: Sim')

# ------------------------------------------------------------------ UC09 – prazos (antes dos locais)
cartao = {'id': cid, 'cpf': '123.456.789-09', 'inscricao': '2026000001'}
data_do_sistema('17/02/2026')
ct('CT09.1', site.chamar('site_cartao', cartao), 'Documento disponível a partir de 18/02/2026.')
data_do_sistema('20/02/2026')
ct('CT09.4', site.chamar('site_locais', id=cid), 'Lista de locais de prova ainda não disponível.')

# ------------------------------------------------------------------ UC05 – Locais e alocação
P1 = provas['P1']


def local(**k):
    base = {'prova_id': P1, 'localidade_id': loc['Rio de Janeiro'], 'local': 'Colégio Estadual Central',
            'endereco': 'Av. Presidente Vargas, 1000 – Centro – Rio de Janeiro/RJ', 'sala': '101', 'capacidade': '40', 'horario': '08:00'}
    return ds.chamar('local_salvar', {**base, **k})


ct('CT05.3', local(sala=''), 'Campo obrigatório não informado: Sala.')
ct('CT05.1', local(), 'Local de prova cadastrado com sucesso.')
r = ds.chamar('alocar', {'prova_id': P1, 'localidade_id': loc['Rio de Janeiro']})
ct('CT05.2', r, 'Candidatos alocados com sucesso.')
verificar('CT05.2 (sem local)', r['sem_local'] == 0, f"Candidatos alocados: {r['alocados']}; sem local: 0")
local(localidade_id=loc['Belo Horizonte'], local='Escola Municipal Afonso Pena', endereco='Av. Afonso Pena, 1500', sala='201', capacidade='1')
r = ds.chamar('alocar', {'prova_id': P1, 'localidade_id': loc['Belo Horizonte']})
ct('CT05.4', r, 'Capacidade insuficiente: 1 candidatos sem local.')
verificar('CT05.4 (parcial)', r['alocados'] == 1 and r['sem_local'] == 1, 'Alocação parcial (2 candidatos para sala de capacidade 1)')

data_do_sistema('18/02/2026')
r = site.chamar('site_cartao', cartao)
verificar('CT09.2', r['ok'] and r['candidato']['nome'] == 'Maria Fernanda Souza' and r['provas'][0]['sala'] == '101',
          'Cartão com nome, inscrição, cargo, localidade e local/sala/horário')
ct('CT09.7', site.chamar('site_cartao', {**cartao, 'inscricao': '2026000999'}), 'Inscrição não encontrada para o CPF informado.')
r = site.chamar('site_vagas', id=cid)
verificar('CT09.3', r['ok'] and r['linhas'][0]['relacao'] == round(r['linhas'][0]['inscritos'] / 5, 2),
          f"Candidatos por vaga – Rio de Janeiro/RJ: {r['linhas'][0]['relacao']} ({r['linhas'][0]['inscritos']} inscritos / 5 vagas)")

# ------------------------------------------------------------------ UC06 – Aplicação da prova
letras = 'A,B,C,D,E,A,B,C,D,E,A,B,C,D,E,A,B,C,D,E'.split(',')
respostas = {str(i + 1): letras[i] for i in range(20)}


def aplicacao(**k):
    return dr.chamar('aplicacao_salvar', {'prova_id': P1, **k})


ct('CT06.1', aplicacao(inscricao='2026000002', situacao='A'), 'Ausência registrada com sucesso.')
r = aplicacao(inscricao='2026000001', situacao='P', respostas=respostas)
ct('CT06.2', r, 'Gabarito do candidato registrado com sucesso.')
verificar('CT06.2 (respostas)', r['detalhe'] == 'Respostas gravadas: 20', r['detalhe'])
ct('CT06.3', aplicacao(inscricao='2026000001', situacao='P', respostas={**respostas, '5': 'F'}), 'Alternativa inválida na questão 5. Use A, B, C, D ou E.')
ct('CT06.4', aplicacao(inscricao='2026000002', situacao='P', respostas={'1': 'A'}), 'Candidato ausente nesta prova: gabarito não permitido.')
ct('CT06.5', aplicacao(inscricao='2026999999', situacao='P', respostas={}), 'Inscrição não encontrada.')

# ------------------------------------------------------------------ UC07 – Gabarito oficial (acesso e validação)
ct('CT07.5', dr.chamar('gabarito_obter', prova_id=P1), 'Acesso restrito ao Supervisor de Seleção.')
ct('CT07.6', sv.chamar('gabarito_salvar', {'prova_id': P1, 'gabarito': {**respostas, '20': ''}}), 'Gabarito oficial incompleto: informe todas as questões.')
ct('CT07.1', sv.chamar('gabarito_salvar', {'prova_id': P1, 'gabarito': respostas}), 'Gabarito oficial cadastrado com sucesso.')
verificar('CT07.1 (auditoria)', any(a['acao'] == 'GABARITO_OFICIAL' for a in sv.chamar('auditoria_listar')['registros']), 'Log de auditoria: registrado')
ct('CT11.2', ds.chamar('financeiro_relatorio', concurso_id=cid), 'Acesso restrito ao Supervisor de Seleção.')

# ------------------------------------------------------------------ Massa completa: correção, recursos, resultados e financeiro
restaurar(2)
cid = 1
r = sv.chamar('correcao_executar', {'concurso_id': cid})
ct('CT07.2/3/4 (mensagem)', r, 'Correção concluída: 8 candidatos corrigidos.')
k = {x['inscricao']: x for x in r['candidatos']}
m = k['2026000001']
verificar('CT07.2', float(m['nota_final']) == 87 and abs(float(m['pct_conjunto']) - 78.57) < .01 and m['situacao'] == 'Não eliminado',
          f"Nota ponderada 87,0; conjunto {m['pct_conjunto']}%; {m['situacao']}")
verificar('CT07.3', k['2026000003']['motivo'] == 'Eliminado – P1 abaixo de 20%', k['2026000003']['motivo'])
verificar('CT07.4', k['2026000004']['motivo'] == 'Eliminado – conjunto abaixo de 30%' and abs(float(k['2026000004']['pct_conjunto']) - 28.57) < .01,
          f"{k['2026000004']['motivo']} ({k['2026000004']['pct_conjunto']}%)")

P2 = {p['codigo']: p['id'] for p in sv.chamar('provas_listar', concurso_id=cid)['provas']}['P2']


def recurso(questao):
    return dr.chamar('recurso_salvar', {'inscricao': '2026000001', 'prova_id': P2, 'questao': questao})


def em_analise():
    return [x for x in sv.chamar('recursos_listar', concurso_id=cid)['recursos'] if x['situacao'] == 'Em análise'][0]['id']


def notas_p2():
    return {x['inscricao']: x['notas'].get('P2') for x in sv.chamar('correcao_resumo', concurso_id=cid)['candidatos'] if x['notas']}


ct('CT08.2', recurso('55'), 'Questão não pertence à prova informada.')
r = recurso('21')
ct('CT08.1', r, 'Recurso cadastrado com sucesso.')
verificar('CT08.1 (situação)', r['detalhe'] == 'Situação: Em análise', r['detalhe'])
ct('CT10.5', site.chamar('site_final', id=cid, cargo_id=1, localidade_id=1), 'Resultado ainda não divulgado.')
antes = notas_p2()
ct('CT08.5', sv.chamar('recurso_julgar', {'id': em_analise(), 'resultado': 'INDEFERIDO'}), 'Recurso indeferido.')
verificar('CT08.5 (notas)', antes == notas_p2(), 'Gabarito oficial e notas inalterados')
recurso('21')
ct('CT08.3', sv.chamar('recurso_julgar', {'id': em_analise(), 'resultado': 'ALTERAR', 'nova_alternativa': 'C'}), 'Recurso deferido. Notas recalculadas.')
depois = notas_p2()
verificar('CT08.3 (recorreção)', depois['2026000001'] == antes['2026000001'] + 1,
          f"Maria marcou C na Q21: P2 {antes['2026000001']} → {depois['2026000001']} (+1 ponto)")
recurso('22')
ct('CT08.4', sv.chamar('recurso_julgar', {'id': em_analise(), 'resultado': 'ANULAR'}), 'Questão anulada. Notas recalculadas.')
final = notas_p2()
verificar('CT08.4 (recorreção)', final['2026000001'] == depois['2026000001'] + 1,
          f"Q22 anulada: P2 de Maria {depois['2026000001']} → {final['2026000001']} (+1 para quem não havia pontuado)")

restaurar(2)
data_do_sistema('22/03/2026')
ct('CT09.5', site.chamar('site_gabarito', id=cid), 'Documento disponível a partir de 23/03/2026.')
data_do_sistema('23/03/2026')
r = site.chamar('site_gabarito', id=cid)
verificar('CT09.6', r['ok'] and [p['codigo'] for p in r['provas']] == ['P1', 'P2'], 'Gabarito: P1 e P2 com as alternativas corretas')
r = site.chamar('site_parcial', id=cid)
insc = [x['inscricao'] for x in r['linhas']]
verificar('CT10.1', r['ok'] and r['provas'] == ['P1', 'P2', 'P3', 'P4'] and insc == sorted(insc) and 'posicao' not in r['linhas'][0],
          'Colunas Inscrição, Nome, P1–P4; ordenado por inscrição; sem classificação')
r = site.chamar('site_final', id=cid, cargo_id=1, localidade_id=1)
nomes = [x['nome'].split()[0] for x in r['classificados']]
verificar('CT10.2', nomes[0] == 'Maria' and nomes.index('Carlos') < nomes.index('Ana') and any(e['nome'].startswith('Bruno') for e in r['eliminados']),
          ' > '.join(nomes) + ' | Bruno: não classificado (eliminado)')
verificar('CT10.3', nomes.index('Carlos') < nomes.index('Paula'), 'Carlos (P2 = 26) à frente de Paula (P2 = 24)')
verificar('CT10.4', nomes.index('Rita') + 1 == nomes.index('Lucas'), 'Rita (10/05/1980) à frente de Lucas (22/09/1992)')

r = sv.chamar('financeiro_relatorio', concurso_id=cid, inicio='12/01/2026', fim='11/02/2026')
verificar('CT11.1', r['ok'] and [(x['inscricoes'], x['valor']) for x in r['linhas']] == [(300, 25500), (200, 17000)]
          and r['total'] == {'inscricoes': 500, 'valor': 42500},
          'Banco A: 300 – R$ 25.500,00; Banco B: 200 – R$ 17.000,00; Total: 500 – R$ 42.500,00')
sv.chamar('homologacao_banco', {'banco': 'Banco B'})
ct('CT11.3', sv.chamar('financeiro_relatorio', concurso_id=cid, banco='Banco B'), 'Dados do banco Banco B indisponíveis. Tente novamente mais tarde.')
sv.chamar('homologacao_banco', {'banco': ''})

# ------------------------------------------------------------------ RNF001 – bloqueio após 3 tentativas inválidas
x = Cliente()
for _ in range(3):
    x.login('dr.teste', 'senhaErrada')
ct('RNF001 (bloqueio)', x.login('dr.teste'), 'Usuário bloqueado')

restaurar(2)  # deixa o ambiente com a massa de referência completa
aprovados = sum(1 for _, ok in resultados if ok)
print(f'\n{aprovados}/{len(resultados)} verificações aprovadas')
reprovados = [i for i, ok in resultados if not ok]
if reprovados:
    print('Reprovados:', ', '.join(reprovados))
sys.exit(1 if reprovados else 0)
