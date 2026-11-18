/* SGCP – Site do Candidato (UC09 – documentos do concurso; UC10 – resultados). */
'use strict';

const TIPOS_PROVA = { OBJETIVA: 'Objetiva', DISCURSIVA: 'Discursiva', PRATICA: 'Prática' };

const DOCUMENTOS = [
  { id: 'locais', titulo: 'Candidatos x locais de prova', texto: 'Lista com local, sala e horário de cada candidato.', regra: 'documentos' },
  { id: 'vagas', titulo: 'Relação candidato/vaga', texto: 'Concorrência por cargo e localidade.', regra: 'documentos' },
  { id: 'cartao', titulo: 'Cartão de confirmação', texto: 'Consulte com o seu CPF e número de inscrição.', regra: 'documentos' },
  { id: 'gabarito', titulo: 'Gabarito oficial', texto: 'Alternativas corretas das provas objetivas.', regra: 'gabarito' },
  { id: 'parcial', titulo: 'Resultado parcial', texto: 'Notas por prova, sem classificação.', regra: null },
  { id: 'final', titulo: 'Resultado final', texto: 'Classificação por cargo e localidade.', regra: null },
];

function avisoHomologacao(hoje, dataReal) {
  const b = $('#banner-homolog');
  const ajustada = dataReal && hoje !== dataReal;
  b.classList.toggle('oculto', !ajustada);
  if (ajustada) b.textContent = `Ambiente de homologação – data do sistema ajustada para ${fmtData(hoje)}`;
}

/* ---------- lista de concursos ---------- */

async function paginaInicial() {
  $('#heroi').innerHTML = `<div class="trilha">Site do candidato</div><h1>Acompanhe o seu concurso do início ao resultado final</h1>
    <p>Locais de prova, cartão de confirmação, gabarito oficial e resultados dos processos seletivos organizados pela AAG Seleções.</p>`;
  const r = await api('site_concursos');
  avisoHomologacao(r.hoje, r.data_real);
  sessionStorage.setItem('sgcp.dataReal', r.data_real);
  $('#corpo').innerHTML = `<div class="lista-concursos">${r.concursos.map(c => {
    const aberto = r.hoje >= c.inicio_inscricoes && r.hoje <= c.termino_inscricoes;
    const futuro = r.hoje < c.inicio_inscricoes;
    return `<a class="cartao concurso-item" href="#/concurso/${c.id}">
      <div><span class="selo ${aberto ? 'selo-verde' : futuro ? 'selo-azul' : 'selo-cinza'}">${aberto ? 'Inscrições abertas' : futuro ? 'Inscrições em breve' : 'Inscrições encerradas'}</span>
        <h2 style="margin-top:8px">${esc(c.empresa)}</h2>
        <div class="meta"><span>Edital <b>nº ${esc(c.edital)}</b></span><span>Publicado em <b>${fmtData(c.data_publicacao)}</b></span>
          <span>Inscrições <b>${fmtData(c.inicio_inscricoes)} a ${fmtData(c.termino_inscricoes)}</b></span><span>Taxa <b>${fmtMoeda(c.taxa)}</b></span><span><b>${c.vagas}</b> vagas</span></div></div>
      <span class="btn btn-primario">Ver concurso</span></a>`;
  }).join('') || '<div class="cartao vazio">Nenhum concurso publicado no momento.</div>'}</div>`;
}

/* ---------- página do concurso ---------- */

async function paginaConcurso(id) {
  const r = await api('site_concurso', { params: { id } });
  const c = r.concurso;
  avisoHomologacao(r.hoje, sessionStorage.getItem('sgcp.dataReal'));
  $('#heroi').innerHTML = `<a class="voltar" href="#/">← Todos os concursos</a><div class="trilha">Edital nº ${esc(c.edital)}</div><h1>${esc(c.empresa)}</h1>
    <p>${r.cargos.map(g => `${esc(g.nome)} – ${g.localidades.map(l => `${esc(l.municipio)}/${esc(l.uf)}`).join(', ')}`).join(' · ')}</p>`;

  const liberacao = { documentos: r.liberacao_documentos, gabarito: r.liberacao_gabarito };
  const selo = d => {
    if (!d.regra) return '<span class="selo selo-azul">Após a correção</span>';
    const data = liberacao[d.regra];
    if (!data) return '<span class="selo selo-cinza">Aguardando provas</span>';
    return r.hoje >= data ? '<span class="selo selo-verde">Disponível</span>' : `<span class="selo selo-ambar">A partir de ${fmtData(data)}</span>`;
  };

  $('#corpo').innerHTML = `
    <div class="cartao resumo-concurso">
      <div><span>Publicação do edital</span><b>${fmtData(c.data_publicacao)}</b></div>
      <div><span>Inscrições</span><b>${fmtData(c.inicio_inscricoes)} a ${fmtData(c.termino_inscricoes)}</b></div>
      <div><span>Taxa de inscrição</span><b>${fmtMoeda(c.taxa)}</b></div>
      <div><span>Vagas</span><b>${r.cargos.reduce((s, g) => s + g.localidades.reduce((t, l) => t + Number(l.vagas), 0), 0)}</b></div>
    </div>
    <h2 style="margin-top:26px" class="nao-imprimir">Documentos e resultados</h2>
    <div class="docs">${DOCUMENTOS.map(d => `<button type="button" class="doc" data-doc="${d.id}" aria-pressed="false">
      <b>${d.titulo}</b><small>${d.texto}</small>${selo(d)}</button>`).join('')}</div>
    <section id="painel-doc" aria-live="polite"></section>
    <div class="cartao nao-imprimir" style="margin-top:20px"><div class="cartao-topo"><h2>Provas do concurso</h2></div>
      <div class="tabela-rolagem"><table><thead><tr><th>Cargo</th><th>Prova</th><th>Data</th><th>Caráter</th><th class="direita">Peso</th><th class="direita">% mínimo</th></tr></thead>
      <tbody>${r.cargos.map(g => g.provas.map(p => `<tr><td>${esc(g.nome)}</td><td><b>${esc(p.rotulo)}</b></td><td class="nowrap">${fmtData(p.data)}</td>
        <td>${p.carater === 'E' ? 'Eliminatória' : 'Classificatória'}</td><td class="direita num">${fmtNum(p.peso, 1)}</td><td class="direita num">${fmtNum(p.pct_min, 0)}%</td></tr>`).join('')).join('')
        || '<tr><td colspan="6" class="vazio">Provas ainda não divulgadas.</td></tr>'}</tbody></table></div></div>`;

  const painel = $('#painel-doc');
  const moldura = (titulo, corpo, imprimir = true) => `<div class="cartao"><div class="cartao-topo"><h2>${titulo}</h2>
    ${imprimir ? '<button type="button" class="btn btn-secundario btn-mini nao-imprimir" onclick="window.print()">Imprimir</button>' : ''}</div>${corpo}</div>`;
  const erro = (titulo, ex) => { painel.innerHTML = moldura(titulo, `<div class="aviso aviso-ambar" role="alert"><div><strong>${esc(ex.message)}</strong></div></div>`, false); };

  const exibir = {
    async locais() {
      const d = await api('site_locais', { params: { id } });
      return moldura('Candidatos x locais de prova', `<div class="tabela-rolagem"><table>
        <thead><tr><th>Inscrição</th><th>Candidato</th><th>Prova</th><th>Data e horário</th><th>Local</th><th>Sala</th></tr></thead>
        <tbody>${d.linhas.map(l => `<tr><td class="num">${esc(l.inscricao)}</td><td>${esc(l.nome)}</td><td>${esc(l.codigo)} – ${esc(l.area)}</td>
          <td class="nowrap">${fmtData(l.data_realizacao)} – ${fmtHora(l.horario)}</td><td>${esc(l.local)}<br><span class="suave pequeno">${esc(l.endereco)}</span></td><td>${esc(l.sala)}</td></tr>`).join('')
          || '<tr><td colspan="6" class="vazio">Nenhum candidato alocado até o momento.</td></tr>'}</tbody></table></div>`);
    },
    async vagas() {
      const d = await api('site_vagas', { params: { id } });
      return moldura('Relação candidato/vaga', `<div class="tabela-rolagem"><table>
        <thead><tr><th>Cargo</th><th>Localidade</th><th class="direita">Vagas</th><th class="direita">Vagas PcD</th><th class="direita">Inscritos</th><th class="direita">Inscritos PcD</th><th class="direita">Candidatos por vaga</th></tr></thead>
        <tbody>${d.linhas.map(l => `<tr><td>${esc(l.cargo)}</td><td><b>${esc(l.municipio)}/${esc(l.uf)}</b></td><td class="direita num">${l.vagas}</td><td class="direita num">${l.vagas_pcd}</td>
          <td class="direita num">${l.inscritos}</td><td class="direita num">${l.inscritos_pcd}</td><td class="direita num"><b>${fmtNum(l.relacao, 2)}</b></td></tr>`).join('')}</tbody></table></div>`);
    },
    async cartao() {
      return moldura('Cartão de confirmação', `<form id="form-cartao" class="form-grade nao-imprimir" novalidate>
          <div class="campo c4"><label for="c-cpf" class="obrig">CPF</label><input type="text" id="c-cpf" name="cpf" data-mask="cpf" inputmode="numeric" placeholder="000.000.000-00"></div>
          <div class="campo c4"><label for="c-insc" class="obrig">Nº de inscrição</label><input type="text" id="c-insc" name="inscricao" data-mask="inteiro" inputmode="numeric" placeholder="2026000001"></div>
          <div class="campo c4" style="justify-content:flex-end"><button type="submit" class="btn btn-primario">Consultar</button></div>
        </form><div id="res-cartao" style="margin-top:16px"></div>`, false);
    },
    async gabarito() {
      const d = await api('site_gabarito', { params: { id } });
      return moldura('Gabarito oficial', d.provas.map(p => `<div class="secao-titulo">${esc(p.cargo)} · ${esc(p.codigo)} – ${esc(p.area)}</div>
        <div class="grade-questoes">${p.questoes.map(x => `<div class="questao ${x.anulada ? 'anulada' : ''}"><span>Q${x.numero}</span>
          <div class="gabarito-letra" ${x.anulada ? 'title="Questão anulada"' : ''}>${x.anulada ? '✕' : esc(x.gabarito)}</div></div>`).join('')}</div>`).join('')
        + '<p class="suave pequeno" style="margin-top:12px">✕ = questão anulada (pontuação atribuída a todos os candidatos presentes).</p>');
    },
    async parcial() {
      const d = await api('site_parcial', { params: { id } });
      return moldura('Resultado parcial – notas sem classificação', `<div class="tabela-rolagem"><table>
        <thead><tr><th>Inscrição</th><th>Nome</th>${d.provas.map(p => `<th class="direita">${esc(p)}</th>`).join('')}</tr></thead>
        <tbody>${d.linhas.map(l => `<tr><td class="num">${esc(l.inscricao)}</td><td>${esc(l.nome)}</td>
          ${d.provas.map(p => `<td class="direita num">${fmtNota((l.notas || {})[p])}</td>`).join('')}</tr>`).join('')
          || '<tr><td colspan="9" class="vazio">Nenhum candidato corrigido.</td></tr>'}</tbody></table></div>
        <p class="suave pequeno" style="margin-top:10px">Candidatos em ordem de número de inscrição. Resultado sujeito a alteração após o julgamento dos recursos.</p>`);
    },
    async final() {
      const pares = r.cargos.flatMap(g => g.localidades.map(l => ({ valor: `${g.id}:${l.id}`, rotulo: `${g.nome} – ${l.municipio}-${l.uf}` })));
      return moldura('Resultado final com classificação', `<form id="form-final" class="form-grade nao-imprimir" novalidate>
          <div class="campo c8"><label for="f-par" class="obrig">Cargo / Localidade</label><select id="f-par">${opcoes(pares, 'valor', 'rotulo')}</select></div>
          <div class="campo c4" style="justify-content:flex-end"><button type="submit" class="btn btn-primario">Consultar</button></div>
        </form><div id="res-final" style="margin-top:16px"></div>`, false);
    },
  };

  async function abrir(doc) {
    $$('.doc').forEach(b => b.setAttribute('aria-pressed', b.dataset.doc === doc));
    const titulo = DOCUMENTOS.find(d => d.id === doc).titulo;
    try {
      painel.innerHTML = await exibir[doc]();
    } catch (ex) {
      erro(titulo, ex); // E1/E2 – documento não liberado ou indisponível
    }
    if (doc === 'cartao') ligarCartao();
    if (doc === 'final') ligarFinal();
    painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function ligarCartao() {
    $('#form-cartao').addEventListener('submit', async e => {
      e.preventDefault();
      const alvo = $('#res-cartao');
      try {
        const d = await api('site_cartao', { dados: { ...lerForm(e.target), id } });
        const k = d.candidato;
        alvo.innerHTML = `<article class="cartao-confirmacao">
          <header><div><b>Cartão de Confirmação de Inscrição</b><br><span class="pequeno">${esc(d.concurso.empresa)} · Edital nº ${esc(d.concurso.edital)}</span></div>
            <button type="button" class="btn btn-ouro btn-mini nao-imprimir" onclick="window.print()">Imprimir</button></header>
          <div class="corpo"><div class="dados">
            <div><span>Candidato</span><b>${esc(k.nome)}</b></div><div><span>Nº de inscrição</span><b class="num">${esc(k.inscricao)}</b></div>
            <div><span>CPF</span><b class="num">${esc(k.cpf)}</b></div><div><span>Cargo</span><b>${esc(k.cargo)}</b></div>
            <div><span>Localidade</span><b>${esc(k.municipio)}-${esc(k.uf)}</b></div><div><span>Concorre às vagas PcD</span><b>${k.pcd ? 'Sim' : 'Não'}</b></div></div>
            <div class="tabela-rolagem"><table><thead><tr><th>Prova</th><th>Data e horário</th><th>Local</th><th>Sala</th></tr></thead>
            <tbody>${d.provas.map(p => `<tr><td><b>${esc(p.codigo)}</b> – ${TIPOS_PROVA[p.tipo]} – ${esc(p.area)}</td>
              <td class="nowrap">${fmtData(p.data_realizacao)}${p.horario ? ' – ' + fmtHora(p.horario) : ''}</td>
              <td>${p.local ? `${esc(p.local)}<br><span class="suave pequeno">${esc(p.endereco)}</span>` : '<span class="suave">Local a definir</span>'}</td><td>${esc(p.sala || '—')}</td></tr>`).join('')}</tbody></table></div>
            <p class="suave pequeno" style="margin-top:12px">Compareça ao local com 1 hora de antecedência, portando documento oficial com foto.</p></div></article>`;
      } catch (ex) {
        // E1/E3 – documento não liberado ou inscrição não encontrada
        alvo.innerHTML = `<div class="aviso aviso-ambar" role="alert"><div><strong>${esc(ex.message)}</strong></div></div>`;
      }
    });
  }

  function ligarFinal() {
    $('#form-final').addEventListener('submit', async e => {
      e.preventDefault();
      const alvo = $('#res-final');
      const [cargoId, locId] = $('#f-par').value.split(':');
      try {
        const d = await api('site_final', { params: { id, cargo_id: cargoId, localidade_id: locId } });
        const L = d.localidade;
        const colunas = d.provas.map(p => `<th class="direita">${esc(p)}</th>`).join('');
        const notas = k => d.provas.map(p => `<td class="direita num">${fmtNota((k.notas || {})[p])}</td>`).join('');
        alvo.innerHTML = `<div class="cartao-topo"><div><h3>${esc(L.cargo)} – ${esc(L.municipio)}-${esc(L.uf)}</h3>
            <p class="suave pequeno">${L.vagas} vaga(s), sendo ${L.vagas_pcd} para PcD · desempate: ${[...d.desempate, 'candidato mais idoso'].map(esc).join(', ')}</p></div>
            <button type="button" class="btn btn-secundario btn-mini nao-imprimir" onclick="window.print()">Imprimir</button></div>
          <div class="tabela-rolagem"><table><thead><tr><th>Classificação</th><th>Inscrição</th><th>Nome</th>${colunas}<th class="direita">Nota final</th><th>Situação</th></tr></thead>
          <tbody>${d.classificados.map(k => `<tr class="${k.posicao <= L.vagas ? 'dentro' : ''}"><td><span class="podio">${k.posicao}º</span></td><td class="num">${esc(k.inscricao)}</td>
            <td><b>${esc(k.nome)}</b>${k.pcd ? ' <span class="selo selo-azul">PcD</span>' : ''}</td>${notas(k)}<td class="direita num"><b>${fmtNum(k.nota_final, 1)}</b></td>
            <td>${k.posicao <= L.vagas ? '<span class="selo selo-verde">Classificado nas vagas</span>' : '<span class="selo selo-cinza">Cadastro de reserva</span>'}</td></tr>`).join('')
            || `<tr><td colspan="${5 + d.provas.length}" class="vazio">Nenhum candidato classificado.</td></tr>`}
          ${d.eliminados.map(k => `<tr><td>—</td><td class="num">${esc(k.inscricao)}</td><td>${esc(k.nome)}</td>${notas(k)}<td class="direita num">–</td>
            <td><span class="selo selo-vermelho">Não classificado · ${esc(k.motivo)}</span></td></tr>`).join('')}</tbody></table></div>`;
      } catch (ex) {
        alvo.innerHTML = `<div class="aviso aviso-ambar" role="alert"><div><strong>${esc(ex.message)}</strong></div></div>`;
      }
    });
  }

  $('.docs').addEventListener('click', e => {
    const b = e.target.closest('[data-doc]');
    if (b) abrir(b.dataset.doc);
  });
}

/* ---------- roteamento ---------- */

async function rotear() {
  const [rota, id] = location.hash.replace(/^#\/?/, '').split('/');
  try {
    if (rota === 'concurso' && id) await paginaConcurso(Number(id)); else await paginaInicial();
  } catch (ex) {
    $('#heroi').innerHTML = '<div class="trilha">Site do candidato</div><h1>AAG Seleções</h1>';
    $('#corpo').innerHTML = `<div class="cartao"><div class="aviso aviso-erro" role="alert"><div><strong>${esc(ex.message)}</strong></div></div>
      <div class="acoes" style="margin-top:14px"><a class="btn btn-primario" href="#/">Voltar aos concursos</a></div></div>`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', rotear);
rotear();
