/* SGCP – utilitários compartilhados entre o site do candidato e o módulo administrativo. */
'use strict';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/** Escapa texto para uso seguro em HTML. */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

class ErroApi extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

/** Chama a API PHP. Com `dados` usa POST (JSON); sem `dados` usa GET com `params`. */
async function api(acao, { params = {}, dados = null } = {}) {
  const qs = new URLSearchParams({ a: acao, ...params });
  let resp;
  try {
    resp = await fetch('api/index.php?' + qs, {
      method: dados ? 'POST' : 'GET',
      headers: dados ? { 'Content-Type': 'application/json' } : {},
      body: dados ? JSON.stringify(dados) : undefined,
      credentials: 'same-origin',
    });
  } catch (e) {
    throw new ErroApi('Não foi possível comunicar com o servidor.', 0);
  }
  let json;
  try {
    json = await resp.json();
  } catch (e) {
    throw new ErroApi('Resposta inválida do servidor. Verifique se o PHP está em execução.', resp.status);
  }
  if (!json.ok) throw new ErroApi(json.mensagem || 'Erro inesperado.', resp.status);
  return json;
}

/* ---------- formatação ---------- */

function fmtData(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function fmtDataHora(iso) {
  return iso ? `${fmtData(iso)} ${String(iso).slice(11, 16)}` : '';
}

function fmtNum(v, casas = 1) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function fmtMoeda(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : cpf;
}

function fmtHora(h) {
  return h ? String(h).replace(':', 'h') : '';
}

function fmtNota(v) {
  if (v === null || v === undefined || v === '') return '–';
  return typeof v === 'string' && isNaN(v) ? v : fmtNum(v, 1);
}

/* ---------- máscaras de entrada (RNF006) ---------- */

const MASCARAS = {
  data: v => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})\/(\d{2})(\d)/, '$1/$2/$3'),
  cpf: v => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4'),
  cep: v => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2'),
  tel: v => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    const meio = d.length > 10 ? 7 : 6;
    return `(${d.slice(0, 2)}) ${d.slice(2, meio)}${d.length > meio ? '-' + d.slice(meio) : ''}`;
  },
  hora: v => v.replace(/\D/g, '').slice(0, 4).replace(/(\d{2})(\d)/, '$1:$2'),
  inteiro: v => v.replace(/\D/g, ''),
  moeda: v => {
    const d = v.replace(/\D/g, '').replace(/^0+(?=\d{3})/, '');
    if (!d) return '';
    const n = d.padStart(3, '0');
    return n.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + n.slice(-2);
  },
  uf: v => v.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase(),
  letra: v => v.slice(-1).toUpperCase(),
};

document.addEventListener('input', e => {
  const m = e.target.dataset && e.target.dataset.mask;
  if (m && MASCARAS[m]) e.target.value = MASCARAS[m](e.target.value);
});

/* ---------- mensagens ---------- */

function toast(mensagem, tipo = 'sucesso') {
  let area = $('#toasts');
  if (!area) {
    area = document.createElement('div');
    area.id = 'toasts';
    area.setAttribute('aria-live', 'polite');
    document.body.appendChild(area);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  el.innerHTML = `<span class="toast-icone">${{ sucesso: '✓', erro: '!', aviso: '!' }[tipo] || 'i'}</span><span>${esc(mensagem)}</span>`;
  area.appendChild(el);
  setTimeout(() => { el.classList.add('saindo'); setTimeout(() => el.remove(), 300); }, tipo === 'erro' ? 7000 : 4500);
}

/** Lê os campos nomeados de um formulário em um objeto simples. */
function lerForm(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; } else if (el.type === 'checkbox') o[el.name] = el.checked ? 1 : 0;
    else o[el.name] = el.value.trim();
  }
  return o;
}

/** Monta as <option> de um select. */
function opcoes(lista, valor, rotulo, selecionado, vazio) {
  const v = typeof valor === 'function' ? valor : x => x[valor];
  const r = typeof rotulo === 'function' ? rotulo : x => x[rotulo];
  return (vazio !== undefined ? `<option value="">${esc(vazio)}</option>` : '') +
    lista.map(x => `<option value="${esc(v(x))}"${String(v(x)) === String(selecionado) ? ' selected' : ''}>${esc(r(x))}</option>`).join('');
}

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
