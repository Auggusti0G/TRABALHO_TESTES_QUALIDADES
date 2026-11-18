/* SGCP – Módulo Administrativo (UC01 a UC08 e UC11). */
'use strict';

const S = 'SELECAO', R = 'RESULTADOS', V = 'SUPERVISOR';
const TIPOS = { OBJETIVA: 'Objetiva', DISCURSIVA: 'Discursiva', PRATICA: 'Prática' };
const CARATER = { E: 'Eliminatória', C: 'Classificatória' };

const estado = { usuario: null, hoje: null, dataReal: null, homologacao: false, concursos: [], concursoId: null };

// grupo → [rota, rótulo, perfis autorizados (omitido = todos)]
const MENU = [
  ['Geral', [['inicio', 'Início']]],
  ['Concursos', [['concurso-novo', 'Novo concurso', [S]], ['concursos', 'Consultar'], ['provas', 'Provas e desempate', [S]]]],
  ['Candidatos', [['candidato-novo', 'Novo candidato', [S]], ['candidatos', 'Consultar']]],
  ['Provas', [['locais', 'Locais de prova', [S]]]],
  ['Resultados', [['aplicacao', 'Aplicação da prova', [R]], ['gabarito', 'Gabarito oficial', [V]], ['correcao', 'Correção', [V]], ['recursos', 'Recursos', [R, V]]]],
  ['Financeiro', [['financeiro', 'Relatório financeiro', [V]]]],
  ['Sistema', [['auditoria', 'Auditoria', [V]], ['homologacao', 'Homologação']]],
];

const PAGINAS = {
  'inicio': paginaInicio,
  'concurso-novo': () => paginaConcurso(null),
  'concurso': id => paginaConcurso(id),
  'concursos': paginaConcursos,
  'provas': paginaProvas,
  'candidato-novo': paginaCandidatoNovo,
  'candidatos': paginaCandidatos,
  'locais': paginaLocais,
  'aplicacao': paginaAplicacao,
  'gabarito': () => paginaGabarito(false),
  'correcao': () => paginaGabarito(true),
  'recursos': paginaRecursos,
  'financeiro': paginaFinanceiro,
  'auditoria': paginaAuditoria,
  'homologacao': paginaHomologacao,
};

const NOME_PERFIL = { [S]: 'Departamento de Seleção', [R]: 'Departamento de Resultados', [V]: 'Supervisor de Seleção' };

function perfisDaRota(rota) {
  if (rota === 'concurso') return null;
  for (const [, itens] of MENU) for (const [r, , perfis] of itens) if (r === rota) return perfis || null;
  return null;
}

function mensagemRestrito(perfis) {
  return 'Acesso restrito ao ' + perfis.map(p => NOME_PERFIL[p]).join(' e ao ') + '.';
}

const podeEditar = perfil => estado.usuario.perfil === perfil;

/* ====================================================================== sessão */

async function iniciar() {
  const s = await api('sessao');
  aplicarSessao(s);
  if (s.usuario) await entrar(); else mostrarLogin();
}

function aplicarSessao(s) {
  estado.usuario = s.usuario;
  estado.hoje = s.hoje;
  estado.dataReal = s.data_real;
  estado.homologacao = s.homologacao;
}

function mostrarLogin(mensagem) {
  $('#app').classList.add('oculto');
  $('#tela-login').classList.remove('oculto');
  const erro = $('#login-erro');
  erro.classList.toggle('oculto', !mensagem);
  erro.textContent = mensagem || '';
  $('#senha').value = '';
  $('#login').focus();
}

$('#form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const erro = $('#login-erro');
  try {
    const r = await api('login', { dados: lerForm(e.target) });
    aplicarSessao(r);
    erro.classList.add('oculto');
    e.target.reset();
    location.hash = '#/inicio';
    await entrar();
    toast(r.mensagem);
  } catch (ex) {
    erro.textContent = ex.message;
    erro.classList.remove('oculto');
  }
});

$('#btn-sair').addEventListener('click', async () => {
  await api('logout', { dados: {} });
  estado.usuario = null;
  mostrarLogin();
});

$('#btn-menu').addEventListener('click', () => $('#app').classList.toggle('menu-aberto'));
$('#conteudo').addEventListener('click', () => $('#app').classList.remove('menu-aberto'));

async function entrar() {
  $('#tela-login').classList.add('oculto');
  $('#app').classList.remove('oculto');
  $('#usuario-nome').textContent = estado.usuario.nome;
  $('#usuario-perfil').textContent = estado.usuario.perfil_nome;
  await carregarConcursos();
  navegar();
}

async function carregarConcursos() {
  estado.concursos = (await api('concursos_listar')).concursos;
  const salvo = Number(localStorage.getItem('sgcp.concurso'));
  if (!estado.concursos.some(c => c.id === estado.concursoId)) {
    estado.concursoId = estado.concursos.some(c => c.id === salvo) ? salvo : (estado.concursos[0] ? estado.concursos[0].id : null);
  }
  const sel = $('#concurso-atual');
  sel.innerHTML = estado.concursos.length
    ? opcoes(estado.concursos, 'id', c => `Edital nº ${c.edital} – ${c.empresa}`, estado.concursoId)
    : '<option value="">Nenhum concurso cadastrado</option>';
  sel.disabled = !estado.concursos.length;
  atualizarChipData();
}

$('#concurso-atual').addEventListener('change', e => {
  estado.concursoId = Number(e.target.value);
  localStorage.setItem('sgcp.concurso', estado.concursoId);
  navegar();
});

function atualizarChipData() {
  const chip = $('#chip-data');
  const ajustada = estado.hoje !== estado.dataReal;
  chip.classList.toggle('ajustada', ajustada);
  chip.textContent = (ajustada ? 'Data do sistema (homologação): ' : 'Hoje: ') + fmtData(estado.hoje);
}

/* ====================================================================== roteamento */

function desenharMenu(rotaAtual) {
  const perfil = estado.usuario.perfil;
  const ativa = rotaAtual === 'concurso' ? 'concursos' : rotaAtual;
  $('#menu').innerHTML = MENU.map(([grupo, itens]) =>
    `<div class="menu-grupo">${grupo}</div>` + itens.map(([rota, rotulo, perfis]) => {
      const restrito = perfis && !perfis.includes(perfil);
      return `<a href="#/${rota}" class="${rota === ativa ? 'ativo' : ''} ${restrito ? 'restrito' : ''}"${rota === ativa ? ' aria-current="page"' : ''}>
        <span>${rotulo}</span>${restrito ? '<span class="cadeado" title="Acesso restrito a outro perfil">restrito</span>' : ''}</a>`;
    }).join('')).join('');
}

async function navegar() {
  if (!estado.usuario) return;
  const [rota = 'inicio', param] = location.hash.replace(/^#\/?/, '').split('/');
  const pagina = PAGINAS[rota] ? rota : 'inicio';
  desenharMenu(pagina);
  $('#app').classList.remove('menu-aberto');
  const perfis = perfisDaRota(pagina);
  const alvo = $('#conteudo');
  alvo.onclick = null;
  if (perfis && !perfis.includes(estado.usuario.perfil)) {
    // E1 dos UC07 e UC11 – acesso por perfil não autorizado
    const msg = mensagemRestrito(perfis);
    toast(msg, 'erro');
    alvo.innerHTML = `<div class="cartao restrito-tela"><div class="icone">!</div><h1>${esc(msg)}</h1>
      <p class="suave" style="margin-top:8px">Você está autenticado como ${esc(estado.usuario.perfil_nome)}. A tela solicitada não foi exibida.</p>
      <div class="acoes" style="justify-content:center;margin-top:20px"><a class="btn btn-primario" href="#/inicio">Voltar ao início</a></div></div>`;
    return;
  }
  try {
    await PAGINAS[pagina](param);
  } catch (ex) {
    tratarErro(ex);
  }
  alvo.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', navegar);

function tratarErro(ex) {
  if (ex.status === 401) {
    estado.usuario = null;
    mostrarLogin(ex.message);
    return;
  }
  toast(ex.message || 'Erro inesperado.', 'erro');
  if (!(ex instanceof ErroApi)) console.error(ex);
}

/** Executa uma ação da interface tratando os erros da API com mensagem ao usuário. */
async function tentar(fn) {
  try {
    return await fn();
  } catch (ex) {
    tratarErro(ex);
    return undefined;
  }
}

function topo(trilha, titulo, descricao = '', acoes = '') {
  return `<div class="pagina-topo"><div><div class="trilha">${esc(trilha)}</div><h1>${esc(titulo)}</h1>${descricao ? `<p>${descricao}</p>` : ''}</div>
    <div class="acoes">${acoes}</div></div>`;
}

function desenhar(html) {
  $('#conteudo').innerHTML = html;
}

function semConcurso(trilha, titulo) {
  desenhar(topo(trilha, titulo) + `<div class="cartao vazio">Nenhum concurso cadastrado. ${podeEditar(S)
    ? '<a href="#/concurso-novo">Cadastre o primeiro concurso</a>.' : 'O Departamento de Seleção deve cadastrar o concurso.'}</div>`);
  return true;
}

async function provasDoConcurso() {
  return (await api('provas_listar', { params: { concurso_id: estado.concursoId } })).provas;
}

const rotuloProvaCompleto = p => `${p.cargo} · ${p.rotulo}`;

function seletorProva(provas, id, selecionada) {
  return `<div class="campo c6"><label for="${id}" class="obrig">Prova</label><select id="${id}">${opcoes(provas, 'id', rotuloProvaCompleto, selecionada)}</select></div>`;
}

function seloSituacao(c) {
  if (c.situacao === 'Não eliminado') return '<span class="selo selo-verde">Não eliminado</span>';
  if (c.situacao === 'Eliminado') return `<span class="selo selo-vermelho">${esc(c.motivo || 'Eliminado')}</span>`;
  if (c.situacao === 'Pendente') return '<span class="selo selo-ambar">Pendente de registros</span>';
  return '<span class="selo selo-cinza">Aguardando correção</span>';
}

/* ====================================================================== início */

async function paginaInicio() {
  const { painel: p } = await api('painel', { params: { concurso_id: estado.concursoId || 0 } });
  const boasVindas = `<div class="aviso aviso-info" style="margin-bottom:18px"><div><strong>Bem-vindo, ${esc(estado.usuario.perfil_nome)}.</strong>
    Use o menu lateral: os itens marcados como “restrito” pertencem a outro perfil.</div></div>`;
  if (!p) {
    desenhar(topo('Geral', 'Tela inicial do SGCP') + boasVindas + '<div class="cartao vazio">Nenhum concurso cadastrado.</div>');
    return;
  }
  const c = p.concurso;
  const marco = (data, texto, feito, pendente) => `<li><time>${fmtData(data)}</time><span>${texto}</span>
    <span class="selo ${data && estado.hoje >= data ? 'selo-verde' : 'selo-cinza'}">${data && estado.hoje >= data ? feito : pendente}</span></li>`;
  desenhar(topo('Geral', 'Tela inicial do SGCP', `Edital nº ${esc(c.edital)} – ${esc(c.empresa)}`) + boasVindas + `
    <div class="indicadores">
      <div class="indicador"><b>${p.candidatos}</b><span>Candidatos inscritos</span></div>
      <div class="indicador"><b>${p.vagas}</b><span>Vagas em ${p.cargos} cargo(s)</span></div>
      <div class="indicador"><b>${p.provas}</b><span>Provas cadastradas</span></div>
      <div class="indicador"><b>${p.locais}</b><span>Salas de prova</span></div>
      <div class="indicador"><b>${p.aptos}</b><span>Não eliminados</span></div>
      <div class="indicador"><b>${p.eliminados}</b><span>Eliminados</span></div>
      <div class="indicador"><b>${p.recursos_pendentes}</b><span>Recursos em análise</span></div>
    </div>
    <div class="cartao">
      <div class="cartao-topo"><h2>Calendário do processo seletivo</h2><span class="suave pequeno">Situação calculada pela data do sistema: ${fmtData(estado.hoje)}</span></div>
      <ul class="linha-tempo">
        ${marco(c.data_publicacao, 'Publicação do edital', 'Publicado', 'A publicar')}
        ${marco(c.inicio_inscricoes, 'Início das inscrições', 'Iniciadas', 'Aguardando')}
        ${marco(c.termino_inscricoes, 'Término das inscrições', 'Encerradas', 'Em aberto')}
        <li><time>${fmtData(p.limite_cadastro)}</time><span>Último dia para cadastrar candidatos (término + 5 dias)</span>
          <span class="selo ${estado.hoje > p.limite_cadastro ? 'selo-vermelho' : 'selo-verde'}">${estado.hoje > p.limite_cadastro ? 'Prazo encerrado' : 'Dentro do prazo'}</span></li>
        ${marco(p.liberacao_documentos, 'Liberação da lista de locais, relação candidato/vaga e cartão (término + 7 dias)', 'Liberados', 'Bloqueados')}
        ${marco(p.liberacao_gabarito, 'Liberação do gabarito oficial (última prova + 1 dia)', 'Liberado', 'Bloqueado')}
        <li><time>${c.correcao_em ? fmtData(c.correcao_em) : '—'}</time><span>Correção das provas</span>
          <span class="selo ${c.correcao_em ? 'selo-verde' : 'selo-cinza'}">${c.correcao_em ? 'Executada' : 'Não executada'}</span></li>
      </ul>
    </div>`);
}

/* ====================================================================== UC02 – concursos */

async function paginaConcursos() {
  await carregarConcursos();
  const linhas = estado.concursos.map(c => `<tr>
      <td><b>Edital nº ${esc(c.edital)}</b></td><td>${esc(c.empresa)}</td><td class="nowrap">${fmtData(c.data_publicacao)}</td>
      <td class="nowrap">${fmtData(c.inicio_inscricoes)} a ${fmtData(c.termino_inscricoes)}</td>
      <td class="direita num">${fmtMoeda(c.taxa)}</td><td class="direita num">${c.vagas}</td><td class="direita num">${c.inscritos}</td>
      <td class="direita"><a class="btn btn-secundario btn-mini" href="#/concurso/${c.id}">${podeEditar(S) ? 'Editar' : 'Abrir'}</a></td></tr>`).join('');
  desenhar(topo('Concursos', 'Consultar concursos', 'Concursos cadastrados a partir dos dados fornecidos pela empresa-objeto.',
    podeEditar(S) ? '<a class="btn btn-primario" href="#/concurso-novo">Novo concurso</a>' : '') + `
    <div class="cartao"><div class="tabela-rolagem"><table>
      <thead><tr><th>Edital</th><th>Empresa-objeto</th><th>Publicação</th><th>Inscrições</th><th class="direita">Taxa</th><th class="direita">Vagas</th><th class="direita">Inscritos</th><th></th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="8" class="vazio">Nenhum concurso cadastrado.</td></tr>'}</tbody></table></div></div>`);
}

async function paginaConcurso(id) {
  const edita = podeEditar(S);
  let c = { cargos: [{ nome: '', localidades: [{}] }] };
  if (id) c = (await api('concurso_obter', { params: { id } })).concurso;
  else if (!edita) { location.hash = '#/concursos'; return; }
  const des = edita ? '' : ' disabled';

  const htmlCargos = cargos => cargos.map((g, i) => `
    <div class="bloco-cargo" data-id="${g.id || ''}">
      <div class="form-grade">
        <div class="campo c8"><label class="obrig">Cargo</label><input type="text" data-c="nome" value="${esc(g.nome)}" placeholder="Ex.: Analista de Sistemas"${des}></div>
        <div class="campo c4" style="justify-content:flex-end;align-items:flex-end">
          ${g.id ? `<span class="selo selo-azul">Total de vagas do cargo: ${g.total_vagas ?? 0}</span>` : ''}
          ${edita && cargos.length > 1 ? `<button type="button" class="btn btn-perigo btn-mini" data-acao="rem-cargo" data-i="${i}">Remover cargo</button>` : ''}
        </div>
      </div>
      ${(g.localidades || []).map((l, j) => `
        <div class="linha-localidade" data-id="${l.id || ''}">
          <div class="campo"><label class="obrig">UF</label><input type="text" data-l="uf" data-mask="uf" value="${esc(l.uf)}" placeholder="RJ"${des}></div>
          <div class="campo"><label class="obrig">Município</label><input type="text" data-l="municipio" value="${esc(l.municipio)}" placeholder="Rio de Janeiro"${des}></div>
          <div class="campo"><label class="obrig">Vagas totais</label><input type="text" inputmode="numeric" data-l="vagas" data-mask="inteiro" value="${esc(l.vagas)}"${des}></div>
          <div class="campo"><label>Vagas PcD</label><input type="text" inputmode="numeric" data-l="vagas_pcd" data-mask="inteiro" value="${esc(l.vagas_pcd)}"${des}></div>
          ${edita && g.localidades.length > 1 ? `<button type="button" class="btn btn-perigo btn-mini" data-acao="rem-loc" data-i="${i}" data-j="${j}" aria-label="Remover localidade">Remover</button>` : '<span></span>'}
        </div>`).join('')}
      ${edita ? `<div class="acoes" style="margin-top:12px"><button type="button" class="btn btn-secundario btn-mini" data-acao="add-loc" data-i="${i}">+ Adicionar localidade</button></div>` : ''}
    </div>`).join('');

  desenhar(topo('Concursos', id ? `Edital nº ${c.edital}` : 'Cadastro de Concurso',
    id ? esc(c.empresa) : 'Informe os dados do edital fornecidos pela empresa-objeto. Campos com <b style="color:var(--vermelho)">*</b> são obrigatórios.') + `
    <form class="cartao" id="form-concurso" novalidate>
      <div class="secao-titulo">Dados do edital</div>
      <div class="form-grade">
        <div class="campo c8"><label for="f-empresa" class="obrig">Empresa-objeto (ou órgão)</label><input type="text" id="f-empresa" name="empresa" value="${esc(c.empresa)}"${des}></div>
        <div class="campo c4"><label for="f-edital" class="obrig">Nº do edital</label><input type="text" id="f-edital" name="edital" value="${esc(c.edital)}" placeholder="01/2026"${des}></div>
        <div class="campo c3"><label for="f-pub" class="obrig">Data de publicação</label><input type="text" id="f-pub" name="data_publicacao" data-mask="data" inputmode="numeric" placeholder="DD/MM/AAAA" value="${fmtData(c.data_publicacao)}"${des}></div>
        <div class="campo c3"><label for="f-ini" class="obrig">Início das inscrições</label><input type="text" id="f-ini" name="inicio_inscricoes" data-mask="data" inputmode="numeric" placeholder="DD/MM/AAAA" value="${fmtData(c.inicio_inscricoes)}"${des}></div>
        <div class="campo c3"><label for="f-fim" class="obrig">Término das inscrições</label><input type="text" id="f-fim" name="termino_inscricoes" data-mask="data" inputmode="numeric" placeholder="DD/MM/AAAA" value="${fmtData(c.termino_inscricoes)}"${des}></div>
        <div class="campo c3"><label for="f-taxa" class="obrig">Taxa de inscrição (R$)</label><input type="text" id="f-taxa" name="taxa" data-mask="moeda" inputmode="numeric" placeholder="0,00" value="${c.taxa != null ? fmtNum(c.taxa, 2) : ''}"${des}></div>
        <div class="campo c4"><label for="f-pct" class="obrig">% mínimo do conjunto de provas</label><input type="text" id="f-pct" name="pct_min_conjunto" inputmode="decimal" placeholder="30" value="${c.pct_min_conjunto != null ? Number(c.pct_min_conjunto) : ''}"${des}>
          <span class="dica">Abaixo deste percentual do total de pontos possíveis o candidato é eliminado.</span></div>
      </div>
      <div class="secao-titulo">Cargos, localidades e vagas</div>
      <div id="cargos"></div>
      ${edita ? `<button type="button" class="btn btn-secundario" data-acao="add-cargo">+ Adicionar cargo</button>
      <div class="acoes acoes-fim"><button type="button" class="btn btn-secundario" id="btn-cancelar">Cancelar</button><button type="submit" class="btn btn-primario">Salvar</button></div>`
      : '<div class="aviso aviso-info">Somente o Departamento de Seleção pode alterar o concurso.</div>'}
    </form>`);

  const form = $('#form-concurso');
  const lerCargos = () => $$('.bloco-cargo', form).map(b => ({
    id: b.dataset.id, nome: $('[data-c=nome]', b).value.trim(),
    total_vagas: (c.cargos.find(x => String(x.id) === b.dataset.id) || {}).total_vagas,
    localidades: $$('.linha-localidade', b).map(l => ({
      id: l.dataset.id, uf: $('[data-l=uf]', l).value.trim(), municipio: $('[data-l=municipio]', l).value.trim(),
      vagas: $('[data-l=vagas]', l).value.trim(), vagas_pcd: $('[data-l=vagas_pcd]', l).value.trim(),
    })),
  }));
  $('#cargos').innerHTML = htmlCargos(c.cargos);
  if (!edita) return;

  form.addEventListener('click', e => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const cargos = lerCargos();
    const i = Number(b.dataset.i);
    if (b.dataset.acao === 'add-cargo') cargos.push({ nome: '', localidades: [{}] });
    if (b.dataset.acao === 'rem-cargo') cargos.splice(i, 1);
    if (b.dataset.acao === 'add-loc') cargos[i].localidades.push({});
    if (b.dataset.acao === 'rem-loc') cargos[i].localidades.splice(Number(b.dataset.j), 1);
    $('#cargos').innerHTML = htmlCargos(cargos);
  });
  // A2 – cancelar descarta os dados informados
  $('#btn-cancelar').addEventListener('click', () => { location.hash = '#/concursos'; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    tentar(async () => {
      const r = await api('concurso_salvar', { dados: { ...lerForm(form), id: id || 0, cargos: lerCargos() } });
      toast(r.mensagem);
      estado.concursoId = r.concurso.id;
      localStorage.setItem('sgcp.concurso', r.concurso.id);
      await carregarConcursos();
      if (String(id) === String(r.concurso.id)) await paginaConcurso(r.concurso.id); else location.hash = '#/concurso/' + r.concurso.id;
    });
  });
}

/* ====================================================================== UC03 – provas, questões e desempate */

async function paginaProvas() {
  if (!estado.concursoId) return semConcurso('Concursos', 'Provas, questões e critérios de desempate');
  const { concurso } = await api('concurso_obter', { params: { id: estado.concursoId } });
  let cargoId = Number(sessionStorage.getItem('sgcp.cargo'));
  if (!concurso.cargos.some(g => g.id === cargoId)) cargoId = concurso.cargos[0].id;

  desenhar(topo('Concursos', 'Provas, questões e critérios de desempate', `Edital nº ${esc(concurso.edital)} – escolha o cargo para cadastrar as provas.`) + `
    <div class="cartao"><div class="form-grade"><div class="campo c6"><label for="sel-cargo" class="obrig">Cargo</label>
      <select id="sel-cargo">${opcoes(concurso.cargos, 'id', 'nome', cargoId)}</select></div></div></div>
    <div id="area-provas"></div>`);
  $('#sel-cargo').addEventListener('change', e => { cargoId = Number(e.target.value); sessionStorage.setItem('sgcp.cargo', cargoId); carregar(); });

  let provas = [];
  async function carregar(editar = null) {
    provas = (await api('provas_listar', { params: { cargo_id: cargoId } })).provas;
    const p = editar ? provas.find(x => x.id === editar) : null;
    const linhas = provas.map(x => `<tr>
        <td><b>${esc(x.codigo)}</b></td><td>${TIPOS[x.tipo]}</td><td>${esc(x.area)}</td>
        <td class="nowrap">${x.tipo === 'PRATICA' ? '—' : `${x.q_inicial} a ${x.q_final}`}</td>
        <td class="direita num">${fmtNum(x.pontos_possiveis, 1)}</td><td class="direita num">${fmtNum(x.peso, 1)}</td>
        <td>${CARATER[x.carater]}</td><td class="nowrap">${fmtData(x.data_realizacao)}</td><td class="direita num">${fmtNum(x.pct_min, 0)}%</td>
        <td class="direita nowrap">${x.tipo === 'OBJETIVA' ? `<button class="btn btn-secundario btn-mini" data-questoes="${x.id}">Questões</button> ` : ''}
          <button class="btn btn-secundario btn-mini" data-editar="${x.id}">Editar</button>
          <button class="btn btn-perigo btn-mini" data-excluir="${x.id}">Excluir</button></td></tr>`).join('');
    const ordem = provas.filter(x => x.ordem_desempate != null).sort((a, b) => a.ordem_desempate - b.ordem_desempate).map(x => x.id);

    $('#area-provas').innerHTML = `
      <div class="cartao"><div class="cartao-topo"><h2>Provas do cargo</h2></div><div class="tabela-rolagem"><table>
        <thead><tr><th>Prova</th><th>Tipo</th><th>Área de conhecimento</th><th>Questões</th><th class="direita">Pontos</th><th class="direita">Peso</th><th>Caráter</th><th>Data</th><th class="direita">% mín.</th><th></th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="10" class="vazio">Nenhuma prova cadastrada para este cargo.</td></tr>'}</tbody></table></div></div>
      <div id="area-questoes"></div>
      <form class="cartao" id="form-prova" novalidate>
        <div class="cartao-topo"><h2>${p ? `Alterar prova ${esc(p.codigo)}` : 'Cadastro de Prova'}</h2>${p ? '<button type="button" class="btn btn-secundario btn-mini" id="btn-nova">Cancelar edição</button>' : ''}</div>
        <div class="form-grade">
          <div class="campo c3"><label for="p-tipo" class="obrig">Tipo</label><select id="p-tipo" name="tipo">${opcoes(Object.entries(TIPOS), x => x[0], x => x[1], p ? p.tipo : 'OBJETIVA')}</select></div>
          <div class="campo c5"><label for="p-area" class="obrig">Área de conhecimento</label><input type="text" id="p-area" name="area" value="${esc(p && p.area)}" placeholder="Ex.: Língua Portuguesa"></div>
          <div class="campo c2"><label for="p-qi" class="obrig">Nº inicial</label><input type="text" id="p-qi" name="q_inicial" data-mask="inteiro" inputmode="numeric" value="${esc(p && p.q_inicial)}"></div>
          <div class="campo c2"><label for="p-qf" class="obrig">Nº final</label><input type="text" id="p-qf" name="q_final" data-mask="inteiro" inputmode="numeric" value="${esc(p && p.q_final)}"></div>
          <div class="campo c3"><label for="p-pont">Pontuação por questão</label><input type="text" id="p-pont" name="pontuacao" inputmode="decimal" value="${p ? '' : '1,0'}" placeholder="1,0">
            <span class="dica">${p ? 'Use o botão “Questões” para ajustar a pontuação.' : 'Aplicada a todas as questões; ajuste depois em “Questões”.'}</span></div>
          <div class="campo c2"><label for="p-peso" class="obrig">Peso</label><input type="text" id="p-peso" name="peso" inputmode="decimal" value="${p ? Number(p.peso) : ''}"></div>
          <div class="campo c3"><label for="p-carater" class="obrig">Caráter</label><select id="p-carater" name="carater">${opcoes(Object.entries(CARATER), x => x[0], x => x[1], p ? p.carater : 'E')}</select></div>
          <div class="campo c2"><label for="p-data" class="obrig">Data de realização</label><input type="text" id="p-data" name="data_realizacao" data-mask="data" inputmode="numeric" placeholder="DD/MM/AAAA" value="${fmtData(p && p.data_realizacao)}"></div>
          <div class="campo c2"><label for="p-pct">% mínimo</label><input type="text" id="p-pct" name="pct_min" inputmode="decimal" value="${p ? Number(p.pct_min) : ''}" placeholder="20"></div>
        </div>
        <div class="acoes acoes-fim"><button type="submit" class="btn btn-primario">Salvar</button></div>
      </form>
      <div class="cartao" id="cartao-desempate">
        <div class="cartao-topo"><div><h2>Critérios de desempate</h2><p class="suave pequeno">Provas que, na ordem definida, desempatam o resultado final.</p></div></div>
        <ol class="ordem-lista" id="lista-desempate"></ol>
        <div class="acoes" style="margin-top:14px">
          <select id="add-desempate" style="max-width:320px" aria-label="Prova a adicionar"></select>
          <button type="button" class="btn btn-secundario" id="btn-add-desempate">Adicionar critério</button>
          <span class="barra-espaco"></span>
          <button type="button" class="btn btn-primario" id="btn-salvar-desempate">Salvar</button>
        </div>
        <div id="ordem-gravada" class="aviso aviso-ok oculto" style="margin-top:14px"></div>
      </div>`;

    // A1 – prova prática: desabilita faixa e pontuação das questões
    const ajustarTipo = () => {
      const t = $('#p-tipo').value;
      $('#p-qi').disabled = $('#p-qf').disabled = t === 'PRATICA';
      $('#p-pont').disabled = t !== 'OBJETIVA' || !!p;
      if (t === 'PRATICA') $('#p-qi').value = $('#p-qf').value = '';
    };
    $('#p-tipo').addEventListener('change', ajustarTipo);
    ajustarTipo();
    if (p) { $('#btn-nova').addEventListener('click', () => carregar()); $('#form-prova').scrollIntoView({ behavior: 'smooth', block: 'center' }); }

    $('#form-prova').addEventListener('submit', e => {
      e.preventDefault();
      tentar(async () => {
        const r = await api('prova_salvar', { dados: { ...lerForm(e.target), cargo_id: cargoId, id: p ? p.id : 0 } });
        toast(`${r.mensagem} ${r.resumo}`);
        await carregar();
      });
    });

    // desempate
    const desenharOrdem = () => {
      $('#lista-desempate').innerHTML = ordem.map((pid, i) => {
        const x = provas.find(y => y.id === pid);
        return `<li><span class="ordem-n">${i + 1}º</span><span><b>${esc(x.codigo)}</b> – ${esc(x.area)}</span><span class="acoes">
          <button type="button" class="btn btn-secundario btn-mini" data-sobe="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
          <button type="button" class="btn btn-secundario btn-mini" data-desce="${i}" ${i === ordem.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
          <button type="button" class="btn btn-perigo btn-mini" data-tira="${i}">Remover</button></span></li>`;
      }).join('') + `<li class="fixo"><span class="ordem-n">${ordem.length + 1}º</span><span><b>Candidato mais idoso</b> – critério final aplicado automaticamente</span></li>`;
      const livres = provas.filter(x => !ordem.includes(x.id));
      $('#add-desempate').innerHTML = opcoes(livres, 'id', x => `${x.codigo} – ${x.area}`, null, livres.length ? 'Selecione a prova…' : 'Todas as provas já estão na lista');
    };
    desenharOrdem();
    $('#cartao-desempate').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.sobe) { const i = +b.dataset.sobe; [ordem[i - 1], ordem[i]] = [ordem[i], ordem[i - 1]]; }
      else if (b.dataset.desce) { const i = +b.dataset.desce; [ordem[i + 1], ordem[i]] = [ordem[i], ordem[i + 1]]; }
      else if (b.dataset.tira) ordem.splice(+b.dataset.tira, 1);
      else if (b.id === 'btn-add-desempate') { const v = Number($('#add-desempate').value); if (v) ordem.push(v); }
      else if (b.id === 'btn-salvar-desempate') {
        return tentar(async () => {
          const r = await api('desempate_salvar', { dados: { cargo_id: cargoId, ordem } });
          toast(r.mensagem);
          const box = $('#ordem-gravada');
          box.textContent = 'Ordem gravada: ' + r.ordem + '.';
          box.classList.remove('oculto');
        });
      } else return;
      desenharOrdem();
    });
  }

  $('#area-provas').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.editar) tentar(() => carregar(Number(b.dataset.editar)));
    if (b.dataset.excluir && confirm('Excluir esta prova?')) {
      tentar(async () => { toast((await api('prova_excluir', { dados: { id: Number(b.dataset.excluir) } })).mensagem); await carregar(); });
    }
    if (b.dataset.questoes) tentar(() => abrirQuestoes(Number(b.dataset.questoes)));
  });

  // RF005 – número e pontuação de cada questão objetiva
  async function abrirQuestoes(provaId) {
    const r = await api('questoes_listar', { params: { prova_id: provaId } });
    $('#area-questoes').innerHTML = `<form class="cartao" id="form-questoes">
      <div class="cartao-topo"><div><h2>Questões da prova ${esc(r.prova.codigo)} – pontuação</h2>
        <p class="suave pequeno">Cada questão objetiva possui cinco alternativas (A, B, C, D e E).</p></div>
        <button type="button" class="btn btn-secundario btn-mini" id="fechar-questoes">Fechar</button></div>
      <div class="grade-questoes">${r.questoes.map(x => `<label class="questao"><span>Q${x.numero}</span>
        <input type="text" inputmode="decimal" name="${x.numero}" value="${String(Number(x.pontuacao)).replace('.', ',')}" aria-label="Pontuação da questão ${x.numero}"></label>`).join('')}</div>
      <div class="acoes acoes-fim"><button type="submit" class="btn btn-primario">Salvar pontuação</button></div></form>`;
    $('#fechar-questoes').addEventListener('click', () => { $('#area-questoes').innerHTML = ''; });
    $('#form-questoes').addEventListener('submit', e => {
      e.preventDefault();
      tentar(async () => {
        toast((await api('questoes_salvar', { dados: { prova_id: provaId, pontuacoes: lerForm(e.target) } })).mensagem);
        await carregar();
      });
    });
    $('#form-questoes').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  await carregar();
}

/* ====================================================================== UC04 – candidatos */

async function paginaCandidatoNovo() {
  if (!estado.concursoId) return semConcurso('Candidatos', 'Cadastro de Candidato');
  const { concurso } = await api('concurso_obter', { params: { id: estado.concursoId } });
  const cab = topo('Candidatos', 'Cadastro de Candidato', `Edital nº ${esc(concurso.edital)} – ${esc(concurso.empresa)}`);
  // P2/E2 – o sistema verifica o prazo antes de exibir a tela
  let limite;
  try {
    limite = (await api('candidato_prazo', { params: { concurso_id: estado.concursoId } })).limite;
  } catch (ex) {
    if (ex.status === 401) throw ex;
    toast(ex.message, 'erro');
    desenhar(cab + `<div class="aviso aviso-erro"><div><strong>${esc(ex.message)}</strong><br>
      Término das inscrições: ${fmtData(concurso.termino_inscricoes)} · data do sistema: ${fmtData(estado.hoje)}. A tela de cadastro não foi exibida.</div></div>`);
    return;
  }
  const cargos = concurso.cargos;
  desenhar(cab + `
    <div class="aviso aviso-info" style="margin-bottom:18px"><div>Cadastro permitido até <strong>${fmtData(limite)}</strong> (5 dias após o término das inscrições). O número de inscrição é gerado automaticamente ao salvar.</div></div>
    <div id="ultimo-cadastro"></div>
    <form class="cartao" id="form-candidato" novalidate>
      <div class="secao-titulo">Dados pessoais</div>
      <div class="form-grade">
        <div class="campo c6"><label for="k-nome" class="obrig">Nome</label><input type="text" id="k-nome" name="nome" autocomplete="off"></div>
        <div class="campo c3"><label for="k-cpf" class="obrig">CPF</label><input type="text" id="k-cpf" name="cpf" data-mask="cpf" inputmode="numeric" placeholder="000.000.000-00"></div>
        <div class="campo c3"><label for="k-nasc" class="obrig">Data de nascimento</label><input type="text" id="k-nasc" name="nascimento" data-mask="data" inputmode="numeric" placeholder="DD/MM/AAAA"></div>
        <div class="campo c4"><span class="rotulo obrig">Sexo</span><div class="opcoes"><label><input type="radio" name="sexo" value="F"> Feminino</label><label><input type="radio" name="sexo" value="M"> Masculino</label></div></div>
        <div class="campo c4"><label for="k-tel" class="obrig">Telefone</label><input type="text" id="k-tel" name="telefone" data-mask="tel" inputmode="numeric" placeholder="(00) 00000-0000"></div>
        <div class="campo c4"><label for="k-tel2">Telefone alternativo</label><input type="text" id="k-tel2" name="telefone2" data-mask="tel" inputmode="numeric" placeholder="(00) 00000-0000"></div>
        <div class="campo c6"><label for="k-email" class="obrig">E-mail</label><input type="email" id="k-email" name="email" placeholder="nome@email.com"></div>
      </div>
      <div class="secao-titulo">Endereço</div>
      <div class="form-grade">
        <div class="campo c3"><label for="k-cep" class="obrig">CEP</label><input type="text" id="k-cep" name="cep" data-mask="cep" inputmode="numeric" placeholder="00000-000"></div>
        <div class="campo c6"><label for="k-log" class="obrig">Logradouro</label><input type="text" id="k-log" name="logradouro"></div>
        <div class="campo c3"><label for="k-num" class="obrig">Número</label><input type="text" id="k-num" name="numero"></div>
        <div class="campo c3"><label for="k-comp">Complemento</label><input type="text" id="k-comp" name="complemento"></div>
        <div class="campo c4"><label for="k-bairro" class="obrig">Bairro</label><input type="text" id="k-bairro" name="bairro"></div>
        <div class="campo c3"><label for="k-cidade" class="obrig">Cidade</label><input type="text" id="k-cidade" name="cidade"></div>
        <div class="campo c2"><label for="k-uf" class="obrig">UF</label><select id="k-uf" name="uf">${opcoes(UFS, x => x, x => x, null, '—')}</select></div>
      </div>
      <div class="secao-titulo">Inscrição</div>
      <div class="form-grade">
        <div class="campo c6"><label for="k-cargo" class="obrig">Cargo</label><select id="k-cargo" name="cargo_id">${opcoes(cargos, 'id', 'nome', cargos[0].id)}</select></div>
        <div class="campo c6"><label for="k-loc" class="obrig">Localidade escolhida</label><select id="k-loc" name="localidade_id"></select></div>
        <div class="campo c4"><span class="rotulo obrig">Deficiente físico</span><div class="opcoes"><label><input type="radio" name="pcd" value="0" checked> Não</label><label><input type="radio" name="pcd" value="1"> Sim</label></div></div>
        <div class="campo c8"><label for="k-def" id="rot-def">Qual deficiência</label><input type="text" id="k-def" name="deficiencia" disabled></div>
      </div>
      <div class="acoes acoes-fim"><button type="reset" class="btn btn-secundario">Limpar</button><button type="submit" class="btn btn-primario">Salvar</button></div>
    </form>`);

  const form = $('#form-candidato');
  const localidades = () => {
    const g = cargos.find(x => String(x.id) === $('#k-cargo').value);
    $('#k-loc').innerHTML = opcoes(g.localidades, 'id', l => `${l.municipio}-${l.uf} (${l.vagas} vagas, ${l.vagas_pcd} PcD)`, null, 'Selecione…');
  };
  // A1 – deficiente físico = Sim torna obrigatório "Qual deficiência"
  const ajustarPcd = () => {
    const sim = form.elements.pcd.value === '1';
    $('#k-def').disabled = !sim;
    $('#rot-def').classList.toggle('obrig', sim);
    if (!sim) $('#k-def').value = '';
  };
  $('#k-cargo').addEventListener('change', localidades);
  form.addEventListener('change', e => { if (e.target.name === 'pcd') ajustarPcd(); });
  form.addEventListener('reset', () => setTimeout(() => { localidades(); ajustarPcd(); }));
  localidades();

  form.addEventListener('submit', e => {
    e.preventDefault();
    tentar(async () => {
      const r = await api('candidato_salvar', { dados: { ...lerForm(form), concurso_id: estado.concursoId } });
      toast(r.mensagem);
      $('#ultimo-cadastro').innerHTML = `<div class="aviso aviso-ok" style="margin-bottom:18px"><div><strong>${esc(r.mensagem)}</strong><br>
        Nº de inscrição gerado automaticamente: <b>${esc(r.inscricao)}</b> · Concorre às vagas PcD: <b>${r.concorre_pcd ? 'Sim' : 'Não'}</b></div></div>`;
      form.reset();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

async function paginaCandidatos() {
  if (!estado.concursoId) return semConcurso('Candidatos', 'Consultar candidatos');
  desenhar(topo('Candidatos', 'Consultar candidatos', 'Candidatos inscritos no concurso selecionado.',
    podeEditar(S) ? '<a class="btn btn-primario" href="#/candidato-novo">Novo candidato</a>' : '') + `
    <div class="cartao"><div class="form-grade" style="margin-bottom:14px"><div class="campo c6"><label for="busca">Buscar por nome, inscrição ou CPF</label>
      <input type="search" id="busca" placeholder="Digite para filtrar…"></div></div><div id="lista-cand"></div></div>`);
  const carregar = async () => {
    const { candidatos } = await api('candidatos_listar', { params: { concurso_id: estado.concursoId, busca: $('#busca').value.replace(/[.\-]/g, '') } });
    $('#lista-cand').innerHTML = `<div class="tabela-rolagem"><table>
      <thead><tr><th>Inscrição</th><th>Nome</th><th>CPF</th><th>Nascimento</th><th>Cargo</th><th>Localidade</th><th>PcD</th><th>Situação</th></tr></thead>
      <tbody>${candidatos.map(k => `<tr><td class="num"><b>${esc(k.inscricao)}</b></td><td>${esc(k.nome)}</td><td class="num nowrap">${fmtCpf(k.cpf)}</td>
        <td class="num">${fmtData(k.nascimento)}</td><td>${esc(k.cargo)}</td><td class="nowrap">${esc(k.municipio)}-${esc(k.uf_localidade)}</td>
        <td>${k.pcd ? `<span class="selo selo-azul" title="${esc(k.deficiencia)}">Sim</span>` : 'Não'}</td><td>${seloSituacao(k)}</td></tr>`).join('')
        || '<tr><td colspan="8" class="vazio">Nenhum candidato encontrado.</td></tr>'}</tbody></table></div>
      <p class="suave pequeno" style="margin-top:10px">${candidatos.length} candidato(s). Dados pessoais tratados conforme a LGPD (Lei nº 13.709/2018).</p>`;
  };
  let t;
  $('#busca').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => tentar(carregar), 250); });
  await carregar();
}

/* ====================================================================== UC05 – locais de prova e alocação */

async function paginaLocais() {
  if (!estado.concursoId) return semConcurso('Provas', 'Locais de Prova');
  const provas = await provasDoConcurso();
  const cab = topo('Provas', 'Locais de Prova', 'Cadastre o local, a sala e o horário de cada prova e aloque os candidatos inscritos.');
  if (!provas.length) return desenhar(cab + '<div class="cartao vazio">Cadastre as provas do concurso antes de informar os locais.</div>');
  let provaId = provas[0].id;
  desenhar(cab + `<div class="cartao"><div class="form-grade">${seletorProva(provas, 'sel-prova', provaId)}</div></div><div id="area-locais"></div>`);
  $('#sel-prova').addEventListener('change', e => { provaId = Number(e.target.value); tentar(carregar); });

  async function carregar() {
    const r = await api('locais_listar', { params: { prova_id: provaId } });
    const prova = provas.find(p => p.id === provaId);
    $('#area-locais').innerHTML = `
      <div class="cartao"><div class="cartao-topo"><div><h2>Alocação dos candidatos – ${esc(prova.codigo)}</h2>
        <p class="suave pequeno">Os candidatos de cada localidade são distribuídos nas salas cadastradas, em ordem de inscrição.</p></div></div>
        <div class="tabela-rolagem"><table><thead><tr><th>Localidade</th><th class="direita">Candidatos</th><th class="direita">Capacidade das salas</th><th class="direita">Alocados</th><th class="direita">Sem local</th><th></th></tr></thead>
        <tbody>${r.localidades.map(l => `<tr><td><b>${esc(l.municipio)}/${esc(l.uf)}</b></td><td class="direita num">${l.candidatos}</td><td class="direita num">${l.capacidade}</td>
          <td class="direita num">${l.alocados}</td><td class="direita num">${l.candidatos - l.alocados > 0 ? `<span class="selo selo-ambar">${l.candidatos - l.alocados}</span>` : '0'}</td>
          <td class="direita"><button class="btn btn-primario btn-mini" data-alocar="${l.id}">Alocar candidatos</button></td></tr>`).join('')}</tbody></table></div>
        <div id="res-alocacao"></div></div>
      <form class="cartao" id="form-local" novalidate>
        <div class="cartao-topo"><h2>Novo local de prova</h2><span class="suave pequeno">Data da prova: ${fmtData(prova.data_realizacao)}</span></div>
        <div class="form-grade">
          <div class="campo c4"><label for="l-loc" class="obrig">Localidade atendida</label><select id="l-loc" name="localidade_id">${opcoes(r.localidades, 'id', l => `${l.municipio}/${l.uf}`)}</select></div>
          <div class="campo c8"><label for="l-local" class="obrig">Local</label><input type="text" id="l-local" name="local" placeholder="Ex.: Colégio Estadual Central"></div>
          <div class="campo c6"><label for="l-end" class="obrig">Endereço</label><input type="text" id="l-end" name="endereco"></div>
          <div class="campo c2"><label for="l-sala" class="obrig">Sala</label><input type="text" id="l-sala" name="sala"></div>
          <div class="campo c2"><label for="l-cap" class="obrig">Capacidade</label><input type="text" id="l-cap" name="capacidade" data-mask="inteiro" inputmode="numeric"></div>
          <div class="campo c2"><label for="l-hora" class="obrig">Horário</label><input type="text" id="l-hora" name="horario" data-mask="hora" inputmode="numeric" placeholder="08:00"></div>
        </div>
        <div class="acoes acoes-fim"><button type="submit" class="btn btn-primario">Salvar local</button></div>
      </form>
      <div class="cartao"><div class="cartao-topo"><h2>Locais cadastrados para a prova ${esc(prova.codigo)}</h2></div><div class="tabela-rolagem"><table>
        <thead><tr><th>Localidade</th><th>Local</th><th>Endereço</th><th>Sala</th><th>Horário</th><th class="direita">Capacidade</th><th class="direita">Alocados</th><th></th></tr></thead>
        <tbody>${r.locais.map(x => `<tr><td class="nowrap">${esc(x.municipio)}/${esc(x.uf)}</td><td>${esc(x.local)}</td><td>${esc(x.endereco)}</td><td>${esc(x.sala)}</td>
          <td class="nowrap">${fmtData(prova.data_realizacao)} – ${fmtHora(x.horario)}</td><td class="direita num">${x.capacidade}</td><td class="direita num">${x.alocados}</td>
          <td class="direita"><button class="btn btn-perigo btn-mini" data-excluir="${x.id}">Excluir</button></td></tr>`).join('')
          || '<tr><td colspan="8" class="vazio">Nenhum local cadastrado para esta prova.</td></tr>'}</tbody></table></div></div>`;

    $('#form-local').addEventListener('submit', e => {
      e.preventDefault();
      tentar(async () => { toast((await api('local_salvar', { dados: { ...lerForm(e.target), prova_id: provaId } })).mensagem); await carregar(); });
    });
  }

  $('#area-locais').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.alocar) {
      tentar(async () => {
        const r = await api('alocar', { dados: { prova_id: provaId, localidade_id: Number(b.dataset.alocar) } });
        toast(r.mensagem, r.aviso ? 'aviso' : 'sucesso');
        await carregar();
        $('#res-alocacao').innerHTML = `<div class="aviso ${r.aviso ? 'aviso-ambar' : 'aviso-ok'}" style="margin-top:14px"><div><strong>${esc(r.mensagem)}</strong>
          Candidatos alocados: ${r.alocados} · Candidatos sem local: ${r.sem_local}${r.aviso ? ' – cadastre novas salas e aloque novamente.' : ''}</div></div>`;
      });
    }
    if (b.dataset.excluir && confirm('Excluir este local de prova?')) {
      tentar(async () => { toast((await api('local_excluir', { dados: { id: Number(b.dataset.excluir) } })).mensagem); await carregar(); });
    }
  });
  await carregar();
}

/* ====================================================================== UC06 – aplicação da prova */

function gradeRespostas(questoes, valores = {}, prefixo = 'q') {
  return `<div class="grade-questoes">${questoes.map(x => `<label class="questao ${x.anulada ? 'anulada' : ''}"><span>Q${x.numero}</span>
    <input type="text" maxlength="1" autocomplete="off" data-q="${x.numero}" name="${prefixo}${x.numero}" value="${esc(valores[x.numero] || '')}" aria-label="Questão ${x.numero}"></label>`).join('')}</div>`;
}

/** Digitação em sequência: avança para a próxima questão a cada letra. */
function ligarGrade(raiz) {
  raiz.addEventListener('input', e => {
    if (!e.target.dataset.q) return;
    e.target.value = e.target.value.toUpperCase();
    if (e.target.value) {
      const todos = $$('input[data-q]', raiz);
      const prox = todos[todos.indexOf(e.target) + 1];
      if (prox) { prox.focus(); prox.select(); }
    }
  });
}

const lerGrade = raiz => Object.fromEntries($$('input[data-q]', raiz).map(i => [i.dataset.q, i.value.trim()]));

async function paginaAplicacao() {
  if (!estado.concursoId) return semConcurso('Resultados', 'Registro de Aplicação da Prova');
  const provas = await provasDoConcurso();
  const cab = topo('Resultados', 'Registro de Aplicação da Prova', 'Após a aplicação de cada prova, registre os candidatos ausentes e as respostas dos candidatos presentes.');
  if (!provas.length) return desenhar(cab + '<div class="cartao vazio">Nenhuma prova cadastrada para o concurso.</div>');
  let provaId = provas[0].id;
  desenhar(cab + `<div class="cartao"><div class="form-grade">${seletorProva(provas, 'sel-prova', provaId)}</div></div><div id="area-aplic"></div>`);
  $('#sel-prova').addEventListener('change', e => { provaId = Number(e.target.value); tentar(carregar); });

  async function carregar() {
    const prova = provas.find(p => p.id === provaId);
    const objetiva = prova.tipo === 'OBJETIVA';
    const questoes = objetiva ? (await api('questoes_listar', { params: { prova_id: provaId } })).questoes : [];
    const { registros } = await api('aplicacoes_listar', { params: { prova_id: provaId } });
    const sit = r => r.situacao === 'A' ? '<span class="selo selo-vermelho">Ausente</span>' : r.situacao === 'P' ? '<span class="selo selo-verde">Presente</span>' : '<span class="selo selo-cinza">Sem registro</span>';

    $('#area-aplic').innerHTML = `
      <form class="cartao" id="form-aplic" novalidate>
        <div class="cartao-topo"><h2>Registro do candidato – prova ${esc(prova.codigo)}</h2></div>
        <div class="form-grade">
          <div class="campo c4"><label for="a-insc" class="obrig">Nº de inscrição</label><input type="text" id="a-insc" name="inscricao" data-mask="inteiro" inputmode="numeric" placeholder="2026000001"></div>
          <div class="campo c4"><span class="rotulo obrig">Situação</span><div class="opcoes"><label><input type="radio" name="situacao" value="P" checked> Presente</label><label><input type="radio" name="situacao" value="A"> Ausente</label></div></div>
          <div class="campo c4" style="justify-content:flex-end"><span id="a-nome" class="suave"></span></div>
        </div>
        ${objetiva ? `<div id="bloco-respostas"><div class="secao-titulo">Respostas do candidato (A a E; em branco = sem resposta)</div>
          <div class="campo" style="margin-bottom:12px"><label for="a-rapido">Preenchimento rápido</label>
            <input type="text" id="a-rapido" placeholder="Cole as respostas em sequência, ex.: A,B,C,D,E,A,B…">
            <span class="dica">Separe por vírgula; use vírgulas seguidas para questão em branco.</span></div>
          ${gradeRespostas(questoes)}</div>` : `<div class="aviso aviso-info" style="margin-top:14px"><div>Prova ${TIPOS[prova.tipo].toLowerCase()}: registre apenas a presença ou a ausência. A nota final é lançada pelo Supervisor de Seleção.</div></div>`}
        <div class="acoes acoes-fim"><button type="submit" class="btn btn-primario">Salvar</button></div>
      </form>
      <div class="cartao"><div class="cartao-topo"><h2>Candidatos do cargo – situação na prova ${esc(prova.codigo)}</h2></div><div class="tabela-rolagem"><table>
        <thead><tr><th>Inscrição</th><th>Nome</th><th>Situação</th>${objetiva ? '<th class="direita">Respostas gravadas</th>' : ''}<th></th></tr></thead>
        <tbody>${registros.map(r => `<tr><td class="num"><b>${esc(r.inscricao)}</b></td><td>${esc(r.nome)}</td><td>${sit(r)}</td>
          ${objetiva ? `<td class="direita num">${r.situacao === 'P' ? r.respondidas : '—'}</td>` : ''}
          <td class="direita nowrap"><button class="btn btn-secundario btn-mini" data-usar="${esc(r.inscricao)}">Selecionar</button>
          ${r.situacao ? `<button class="btn btn-perigo btn-mini" data-limpar="${esc(r.inscricao)}">Excluir registro</button>` : ''}</td></tr>`).join('')
          || '<tr><td colspan="5" class="vazio">Nenhum candidato inscrito neste cargo.</td></tr>'}</tbody></table></div></div>`;

    const form = $('#form-aplic');
    if (objetiva) {
      ligarGrade(form);
      $('#a-rapido').addEventListener('input', e => {
        const partes = e.target.value.split(/[,;\s]/).map(s => s.trim().toUpperCase());
        $$('input[data-q]', form).forEach((inp, i) => { if (partes[i] !== undefined) inp.value = partes[i].slice(0, 1); });
      });
      const ajustar = () => { $('#bloco-respostas').classList.toggle('oculto', form.elements.situacao.value === 'A'); };
      form.addEventListener('change', e => { if (e.target.name === 'situacao') ajustar(); });
    }
    // E3 – busca do candidato ao sair do campo de inscrição
    const buscar = async () => {
      const insc = $('#a-insc').value;
      $('#a-nome').textContent = '';
      if (!insc) return;
      try {
        const r = await api('aplicacao_buscar', { params: { prova_id: provaId, inscricao: insc } });
        $('#a-nome').innerHTML = `Candidato: <b>${esc(r.candidato.nome)}</b>${r.registro ? ` · registro atual: ${r.registro.situacao === 'A' ? 'Ausente' : 'Presente'}` : ''}`;
        if (r.registro && r.registro.situacao === 'P' && r.registro.respostas) {
          $$('input[data-q]', form).forEach(inp => { inp.value = r.registro.respostas[inp.dataset.q] || ''; });
        }
      } catch (ex) {
        if (ex.status === 401) return tratarErro(ex);
        $('#a-nome').innerHTML = `<span style="color:var(--vermelho);font-weight:600">${esc(ex.message)}</span>`;
      }
    };
    $('#a-insc').addEventListener('change', buscar);
    form.addEventListener('submit', e => {
      e.preventDefault();
      tentar(async () => {
        const d = lerForm(form);
        const r = await api('aplicacao_salvar', { dados: { prova_id: provaId, inscricao: d.inscricao, situacao: d.situacao, respostas: objetiva ? lerGrade(form) : null } });
        toast(`${r.mensagem} ${r.detalhe}.`);
        await carregar();
      });
    });
    $('#area-aplic').onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.usar) { $('#a-insc').value = b.dataset.usar; buscar(); form.scrollIntoView({ behavior: 'smooth' }); }
      if (b.dataset.limpar && confirm('Excluir o registro de aplicação deste candidato?')) {
        tentar(async () => { toast((await api('aplicacao_excluir', { dados: { prova_id: provaId, inscricao: b.dataset.limpar } })).mensagem); await carregar(); });
      }
    };
  }
  await carregar();
}

/* ====================================================================== UC07 – gabarito oficial e correção */

function quadroCorrecao(r) {
  if (!r.candidatos.length) return '<div class="vazio">Nenhum candidato inscrito.</div>';
  return `<div class="tabela-rolagem"><table><thead><tr><th>Inscrição</th><th>Nome</th>${r.provas.map(p => `<th class="direita">${esc(p)}</th>`).join('')}
    <th class="direita">Nota ponderada</th><th class="direita">% do conjunto</th><th>Situação</th></tr></thead>
    <tbody>${r.candidatos.map(k => `<tr><td class="num"><b>${esc(k.inscricao)}</b></td><td>${esc(k.nome)}</td>
      ${r.provas.map(p => `<td class="direita num">${fmtNota((k.notas || {})[p])}</td>`).join('')}
      <td class="direita num"><b>${k.nota_final != null ? fmtNum(k.nota_final, 1) : '–'}</b></td>
      <td class="direita num">${k.pct_conjunto != null ? fmtNum(k.pct_conjunto, 1) + '%' : '–'}</td><td>${seloSituacao(k)}</td></tr>`).join('')}</tbody></table></div>`;
}

async function paginaGabarito(focoCorrecao) {
  if (!estado.concursoId) return semConcurso('Resultados', 'Gabarito Oficial e Correção');
  const provas = await provasDoConcurso();
  const resumo = await api('correcao_resumo', { params: { concurso_id: estado.concursoId } });
  let provaId = provas[0] ? provas[0].id : null;

  const cartaoGabarito = `<div class="cartao" id="cartao-gabarito"><div class="cartao-topo"><div><h2>Gabarito oficial e notas finais</h2>
      <p class="suave pequeno">Provas objetivas: alternativa correta de cada questão. Provas discursiva e prática: nota final (0 a 10) de cada candidato presente.</p></div></div>
    ${provas.length ? `<div class="form-grade">${seletorProva(provas, 'sel-prova', provaId)}</div><div id="area-gabarito" style="margin-top:16px"></div>` : '<div class="vazio">Nenhuma prova cadastrada.</div>'}</div>`;
  const cartaoCorrecao = `<div class="cartao" id="cartao-correcao"><div class="cartao-topo"><div><h2>Correção das provas</h2>
      <p class="suave pequeno">Nota ponderada = Σ (pontos × peso). Aplica os percentuais mínimos por prova eliminatória e do conjunto de provas.</p></div>
      <button class="btn btn-ouro" id="btn-corrigir" ${provas.length ? '' : 'disabled'}>Executar correção</button></div>
    <p class="suave pequeno" id="info-correcao" style="margin-bottom:12px"></p><div id="quadro"></div></div>`;

  desenhar(topo('Resultados', 'Gabarito Oficial e Correção', 'Cadastro do gabarito oficial e correção: responsabilidade exclusiva do Supervisor de Seleção. Toda alteração gera log de auditoria.')
    + (focoCorrecao ? cartaoCorrecao + cartaoGabarito : cartaoGabarito + cartaoCorrecao));

  const mostrarResumo = r => {
    $('#info-correcao').textContent = `${r.candidatos.length} candidato(s) no concurso · ` + (r.correcao_em ? `última correção em ${fmtDataHora(r.correcao_em)}` : 'correção ainda não executada');
    $('#quadro').innerHTML = quadroCorrecao(r);
  };
  mostrarResumo(resumo);
  $('#btn-corrigir').addEventListener('click', () => tentar(async () => {
    const r = await api('correcao_executar', { dados: { concurso_id: estado.concursoId } });
    toast(r.mensagem);
    mostrarResumo(r);
  }));
  if (!provas.length) return;

  async function carregarProva() {
    const prova = provas.find(p => p.id === provaId);
    const area = $('#area-gabarito');
    if (prova.tipo === 'OBJETIVA') {
      const { questoes } = await api('gabarito_obter', { params: { prova_id: provaId } });
      const valores = Object.fromEntries(questoes.map(x => [x.numero, x.gabarito]));
      const anuladas = questoes.filter(x => x.anulada).map(x => x.numero);
      area.innerHTML = `<form id="form-gab" novalidate>
        ${anuladas.length ? `<div class="aviso aviso-ambar" style="margin-bottom:12px"><div>Questões anuladas por recurso: <strong>${anuladas.join(', ')}</strong> (pontuação atribuída a todos os presentes).</div></div>` : ''}
        ${gradeRespostas(questoes, valores)}
        <div class="acoes acoes-fim"><button type="submit" class="btn btn-primario">Salvar gabarito</button></div></form>`;
      ligarGrade($('#form-gab'));
      $('#form-gab').addEventListener('submit', e => {
        e.preventDefault();
        tentar(async () => {
          const r = await api('gabarito_salvar', { dados: { prova_id: provaId, gabarito: lerGrade(e.target) } });
          toast(`${r.mensagem} ${r.detalhe}`);
        });
      });
    } else {
      // A1 – prova discursiva ou prática
      const { candidatos } = await api('notas_listar', { params: { prova_id: provaId } });
      area.innerHTML = `<form id="form-notas" novalidate><div class="tabela-rolagem"><table>
        <thead><tr><th>Inscrição</th><th>Nome</th><th>Situação</th><th style="width:150px">Nota final (0 a 10)</th></tr></thead>
        <tbody>${candidatos.map(k => `<tr><td class="num"><b>${esc(k.inscricao)}</b></td><td>${esc(k.nome)}</td>
          <td>${k.situacao === 'A' ? '<span class="selo selo-vermelho">Ausente</span>' : k.situacao === 'P' ? '<span class="selo selo-verde">Presente</span>' : '<span class="selo selo-cinza">Sem registro</span>'}</td>
          <td><input type="text" inputmode="decimal" name="${esc(k.inscricao)}" value="${k.nota != null ? fmtNum(k.nota, 1) : ''}" ${k.situacao === 'A' ? 'disabled' : ''} aria-label="Nota de ${esc(k.nome)}"></td></tr>`).join('')
          || '<tr><td colspan="4" class="vazio">Nenhum candidato inscrito neste cargo.</td></tr>'}</tbody></table></div>
        <div class="acoes acoes-fim"><button type="submit" class="btn btn-primario">Salvar notas</button></div></form>`;
      $('#form-notas').addEventListener('submit', e => {
        e.preventDefault();
        tentar(async () => { toast((await api('notas_salvar', { dados: { prova_id: provaId, notas: lerForm(e.target) } })).mensagem); await carregarProva(); });
      });
    }
  }
  $('#sel-prova').addEventListener('change', e => { provaId = Number(e.target.value); tentar(carregarProva); });
  await carregarProva();
}

/* ====================================================================== UC08 – recursos */

async function paginaRecursos() {
  if (!estado.concursoId) return semConcurso('Resultados', 'Recursos');
  const objetivas = (await provasDoConcurso()).filter(p => p.tipo === 'OBJETIVA');
  const cadastra = podeEditar(R), julga = podeEditar(V);
  desenhar(topo('Resultados', 'Recursos', 'O Departamento de Resultados cadastra o recurso; o Supervisor de Seleção registra o resultado da análise da equipe técnica, com recorreção automática.') + `
    ${cadastra ? `<form class="cartao" id="form-recurso" novalidate><div class="cartao-topo"><h2>Novo recurso</h2></div>
      <div class="form-grade">
        <div class="campo c3"><label for="r-insc" class="obrig">Nº de inscrição</label><input type="text" id="r-insc" name="inscricao" data-mask="inteiro" inputmode="numeric" placeholder="2026000001"></div>
        <div class="campo c6"><label for="r-prova" class="obrig">Prova</label><select id="r-prova" name="prova_id">${opcoes(objetivas, 'id', p => `${rotuloProvaCompleto(p)} (questões ${p.q_inicial} a ${p.q_final})`)}</select></div>
        <div class="campo c3"><label for="r-q" class="obrig">Questão de referência</label><input type="text" id="r-q" name="questao" data-mask="inteiro" inputmode="numeric"></div>
      </div><div class="acoes acoes-fim"><button type="submit" class="btn btn-primario">Salvar recurso</button></div></form>` : ''}
    <div id="area-julgar"></div>
    <div class="cartao"><div class="cartao-topo"><h2>Recursos cadastrados</h2></div><div id="lista-recursos"></div></div>`);

  let recursos = [];
  async function carregar() {
    recursos = (await api('recursos_listar', { params: { concurso_id: estado.concursoId } })).recursos;
    const selo = s => `<span class="selo ${s === 'Em análise' ? 'selo-ambar' : s === 'Indeferido' ? 'selo-cinza' : 'selo-verde'}">${esc(s)}</span>`;
    $('#lista-recursos').innerHTML = `<div class="tabela-rolagem"><table>
      <thead><tr><th>Nº</th><th>Inscrição</th><th>Candidato</th><th>Prova</th><th class="direita">Questão</th><th>Gabarito atual</th><th>Situação</th><th>Cadastro</th><th>Julgamento</th><th></th></tr></thead>
      <tbody>${recursos.map(x => `<tr><td class="num">#${x.id}</td><td class="num">${esc(x.inscricao)}</td><td>${esc(x.nome)}</td><td>${esc(x.codigo)}</td>
        <td class="direita num"><b>${x.questao}</b></td><td>${x.anulada ? '<span class="selo selo-ambar">Anulada</span>' : esc(x.gabarito_atual || '—')}</td><td>${selo(x.situacao)}</td>
        <td class="nowrap pequeno">${fmtDataHora(x.criado_em)}<br><span class="suave">${esc(x.criado_por)}</span></td>
        <td class="nowrap pequeno">${x.julgado_em ? `${fmtDataHora(x.julgado_em)}<br><span class="suave">${esc(x.julgado_por)}</span>` : '—'}</td>
        <td class="direita">${julga && x.situacao === 'Em análise' ? `<button class="btn btn-primario btn-mini" data-julgar="${x.id}">Julgar</button>` : ''}</td></tr>`).join('')
        || '<tr><td colspan="10" class="vazio">Nenhum recurso cadastrado.</td></tr>'}</tbody></table></div>`;
  }

  if (cadastra) {
    $('#form-recurso').addEventListener('submit', e => {
      e.preventDefault();
      tentar(async () => {
        const r = await api('recurso_salvar', { dados: lerForm(e.target) });
        toast(`${r.mensagem} ${r.detalhe}.`);
        e.target.reset();
        await carregar();
      });
    });
  }

  $('#lista-recursos').addEventListener('click', e => {
    const b = e.target.closest('[data-julgar]');
    if (!b) return;
    const x = recursos.find(y => y.id === Number(b.dataset.julgar));
    $('#area-julgar').innerHTML = `<form class="cartao" id="form-julgar" novalidate>
      <div class="cartao-topo"><div><h2>Resultado da análise – recurso #${x.id}</h2>
        <p class="suave pequeno">${esc(x.nome)} (${esc(x.inscricao)}) · prova ${esc(x.codigo)} · questão ${x.questao} · gabarito oficial atual: <b>${esc(x.gabarito_atual || '—')}</b></p></div>
        <button type="button" class="btn btn-secundario btn-mini" id="fechar-julgar">Fechar</button></div>
      <div class="form-grade">
        <div class="campo c6"><label for="j-res" class="obrig">Resultado da análise</label><select id="j-res" name="resultado">
          <option value="ALTERAR">Alterar gabarito</option><option value="ANULAR">Anular questão</option><option value="INDEFERIDO">Indeferido</option></select></div>
        <div class="campo c3"><label for="j-nova" class="obrig">Nova alternativa</label><select id="j-nova" name="nova_alternativa">
          ${opcoes(['A', 'B', 'C', 'D', 'E'].filter(l => l !== x.gabarito_atual), l => l, l => l, null, 'Selecione…')}</select></div>
      </div><div class="acoes acoes-fim"><button type="submit" class="btn btn-primario">Registrar resultado</button></div></form>`;
    const form = $('#form-julgar');
    // "Nova alternativa" habilitada somente para "Alterar gabarito"
    $('#j-res').addEventListener('change', ev => { $('#j-nova').disabled = ev.target.value !== 'ALTERAR'; });
    $('#fechar-julgar').addEventListener('click', () => { $('#area-julgar').innerHTML = ''; });
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      tentar(async () => {
        const r = await api('recurso_julgar', { dados: { ...lerForm(form), id: x.id } });
        toast(`${r.mensagem} ${r.detalhe}`);
        $('#area-julgar').innerHTML = '';
        await carregar();
      });
    });
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await carregar();
}

/* ====================================================================== UC11 – relatório financeiro e auditoria */

async function paginaFinanceiro() {
  if (!estado.concursoId) return semConcurso('Financeiro', 'Relatório Financeiro');
  const c = estado.concursos.find(x => x.id === estado.concursoId);
  const { bancos } = await api('financeiro_filtros');
  desenhar(topo('Financeiro', 'Relatório Financeiro', 'Pagamentos das taxas de inscrição informados pelos bancos conveniados, obtidos dos arquivos de retorno sem digitação manual.') + `
    <form class="cartao" id="form-fin" novalidate><div class="form-grade">
      <div class="campo c3"><label for="f-ini">Período – início</label><input type="text" id="f-ini" name="inicio" data-mask="data" inputmode="numeric" placeholder="DD/MM/AAAA" value="${fmtData(c.inicio_inscricoes)}"></div>
      <div class="campo c3"><label for="f-fim">Período – fim</label><input type="text" id="f-fim" name="fim" data-mask="data" inputmode="numeric" placeholder="DD/MM/AAAA" value="${fmtData(c.termino_inscricoes)}"></div>
      <div class="campo c3"><label for="f-banco">Banco</label><select id="f-banco" name="banco">${opcoes(bancos, b => b, b => b, null, 'Todos os bancos conveniados')}</select></div>
      <div class="campo c3" style="justify-content:flex-end"><button type="submit" class="btn btn-primario">Gerar relatório</button></div>
    </div></form><div id="area-fin"></div>`);
  $('#form-fin').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api('financeiro_relatorio', { params: { ...lerForm(e.target), concurso_id: estado.concursoId } });
      $('#area-fin').innerHTML = `<div class="cartao"><div class="cartao-topo"><div><h2>Edital nº ${esc(r.concurso.edital)} – arrecadação por banco</h2>
          <p class="suave pequeno">Taxa de inscrição vigente: ${fmtMoeda(r.concurso.taxa)} · candidatos cadastrados no SGCP: ${r.inscritos_cadastrados}</p></div>
          <button class="btn btn-secundario btn-mini" onclick="window.print()">Imprimir</button></div>
        <div class="tabela-rolagem"><table><thead><tr><th>Banco conveniado</th><th class="direita">Inscrições pagas</th><th class="direita">Valor arrecadado</th></tr></thead>
        <tbody>${r.linhas.map(l => `<tr><td><b>${esc(l.banco)}</b></td><td class="direita num">${l.inscricoes}</td><td class="direita num">${fmtMoeda(l.valor)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="direita num">${r.total.inscricoes}</td><td class="direita num">${fmtMoeda(r.total.valor)}</td></tr></tfoot></table></div></div>`;
    } catch (ex) {
      if (ex.status === 401) return tratarErro(ex);
      // E2 – informação bancária indisponível: relatório não gerado
      toast(ex.message, 'erro');
      $('#area-fin').innerHTML = `<div class="aviso aviso-erro"><div><strong>${esc(ex.message)}</strong><br>Relatório não gerado.</div></div>`;
    }
  });
}

async function paginaAuditoria() {
  const { registros } = await api('auditoria_listar');
  desenhar(topo('Sistema', 'Log de Auditoria', 'Registro de toda inclusão ou alteração do gabarito oficial, execução de correção e resultado de recurso (RNF003).') + `
    <div class="cartao"><div class="tabela-rolagem"><table>
      <thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Detalhe</th><th>Valor anterior</th><th>Valor novo</th></tr></thead>
      <tbody>${registros.map(a => `<tr><td class="nowrap num">${fmtDataHora(a.data_hora)}</td><td>${esc(a.usuario)}</td><td><span class="selo selo-azul">${esc(a.acao)}</span></td>
        <td>${esc(a.detalhe)}</td><td class="pequeno" style="max-width:260px;word-break:break-word">${esc(a.valor_anterior || '—')}</td>
        <td class="pequeno" style="max-width:260px;word-break:break-word">${esc(a.valor_novo || '—')}</td></tr>`).join('')
        || '<tr><td colspan="6" class="vazio">Nenhum registro de auditoria.</td></tr>'}</tbody></table></div></div>`);
}

/* ====================================================================== homologação */

async function paginaHomologacao() {
  const h = await api('homologacao_estado');
  const cab = topo('Sistema', 'Ambiente de Homologação', 'Ferramentas previstas no Plano de Teste (Artefato 03): data do sistema ajustável e restauração da massa de dados de referência.');
  if (!h.homologacao) return desenhar(cab + '<div class="aviso aviso-info">Ambiente de produção: as ferramentas de homologação estão desativadas (api/config.php).</div>');
  const datas = [['20/01/2026', 'Inscrições abertas'], ['16/02/2026', 'Último dia de cadastro'], ['17/02/2026', 'Prazo encerrado'], ['18/02/2026', 'Documentos liberados'],
    ['20/02/2026', 'Após liberação'], ['22/03/2026', 'Dia da última prova'], ['23/03/2026', 'Gabarito liberado']];
  desenhar(cab + `
    <div class="cartao"><div class="cartao-topo"><div><h2>Data do sistema</h2><p class="suave pequeno">Data real: ${fmtData(h.data_real)} · data considerada pelo sistema: <b>${fmtData(h.hoje)}</b></p></div></div>
      <form id="form-data" class="acoes" novalidate>
        <input type="text" name="data" data-mask="data" inputmode="numeric" placeholder="DD/MM/AAAA" value="${fmtData(h.data_ajustada)}" style="max-width:170px" aria-label="Nova data do sistema">
        <button type="submit" class="btn btn-primario">Ajustar data</button>
        <button type="button" class="btn btn-secundario" id="btn-data-real">Usar data real</button>
      </form>
      <div class="acoes" style="margin-top:14px">${datas.map(([d, r]) => `<button class="btn btn-secundario btn-mini" data-data="${d}" title="${r}">${d} · ${r}</button>`).join('')}</div>
    </div>
    <div class="cartao"><div class="cartao-topo"><div><h2>Massa de dados de referência</h2>
        <p class="suave pequeno">Restaura o banco de dados (${esc(h.driver)}) e recria os usuários de teste. Nível atual: ${esc(h.nivel_massa ?? '—')}. <b>Todos os dados atuais são apagados.</b></p></div></div>
      <div class="acoes">
        <button class="btn btn-secundario" data-nivel="0">0 · Somente usuários (banco vazio)</button>
        <button class="btn btn-secundario" data-nivel="1">1 · Concurso, cargo e provas</button>
        <button class="btn btn-primario" data-nivel="2">2 · Massa completa (candidatos, gabaritos e correção)</button>
      </div></div>
    <div class="cartao"><div class="cartao-topo"><div><h2>Bancos conveniados</h2><p class="suave pequeno">Simula a indisponibilidade do serviço de um banco para o teste do relatório financeiro (CT11.3).</p></div></div>
      <div class="acoes"><select id="sel-banco" style="max-width:320px" aria-label="Banco indisponível">${opcoes(h.bancos, b => b, b => `${b} fora do ar`, h.banco_indisponivel, 'Todos os bancos disponíveis')}</select>
      <button class="btn btn-primario" id="btn-banco">Aplicar</button></div></div>`);

  const definirData = data => tentar(async () => {
    const r = await api('homologacao_data', { dados: { data } });
    estado.hoje = r.hoje;
    atualizarChipData();
    toast(r.mensagem);
    await paginaHomologacao();
  });
  $('#form-data').addEventListener('submit', e => { e.preventDefault(); definirData(lerForm(e.target).data); });
  $('#btn-data-real').addEventListener('click', () => definirData(''));
  $('#btn-banco').addEventListener('click', () => tentar(async () => toast((await api('homologacao_banco', { dados: { banco: $('#sel-banco').value } })).mensagem)));
  $('#conteudo').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.data) definirData(b.dataset.data);
    if (b.dataset.nivel && confirm('Restaurar o banco de dados? Todos os dados atuais serão apagados.')) {
      tentar(async () => {
        const r = await api('homologacao_restaurar', { dados: { nivel: Number(b.dataset.nivel) } });
        estado.hoje = r.hoje;
        estado.concursoId = null;
        await carregarConcursos();
        toast(r.mensagem);
        await paginaHomologacao();
      });
    }
  };
}

iniciar().catch(ex => mostrarLogin(ex.message));
