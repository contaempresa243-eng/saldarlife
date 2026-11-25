(() => {
  'use strict';

  const KEY = 'saldar-life-v1';
  const KEY_OP = 'saldar-life-operadora';
  const KEY_BACKUP = 'saldar-life-ultimo-backup';
  const KEY_CARRINHO = 'saldar-life-carrinho';
  const KEY_MARGENS = 'saldar-life-margens';
  const KEY_PACOTES = 'saldar-life-pacotes';
  const KEY_OCULTO = 'saldar-life-oculto';

  // Cartões: custo do pacote e quantos cartões vêm nele. Lucro por cartão = valor - custo / quantidade.
  const PACOTES_PADRAO = { 'Africell 200': { custo: 4650, qtd: 25 } };

  // Margem de lucro (%) por produto. Chave: tipo|nome. O que não está aqui conta como 0%.
  const MARGENS_PADRAO = { 'Recarga|Unitel': 7.2, 'Recarga|Africell': 9.5 };

  const PAGAMENTOS = ['Dinheiro', 'Transferência', 'Multicaixa'];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let vendas = carregar();
  let carrinho = carregarCarrinho();
  let margens = carregarMargens();
  let pacotes = carregarPacotes();
  let oculto = lerLS(KEY_OCULTO) === '1';
  let tipo = 'Recarga';
  let pagamento = 'Dinheiro';
  let carrinhoVisivel = false;

  /* ---------- armazenamento ---------- */
  function carregar() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }

  function guardar() {
    try {
      localStorage.setItem(KEY, JSON.stringify(vendas));
      return true;
    } catch (e) {
      aviso('Não foi possível guardar. Verifica o espaço do telemóvel.');
      return false;
    }
  }

  function carregarCarrinho() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY_CARRINHO));
      return Array.isArray(v) ? v.filter(i => i && Number(i.valor) > 0) : [];
    } catch (e) {
      return [];
    }
  }

  function guardarCarrinho() {
    try { localStorage.setItem(KEY_CARRINHO, JSON.stringify(carrinho)); } catch (e) { /* ignora */ }
  }

  function carregarMargens() {
    let guardadas = {};
    try {
      const v = JSON.parse(localStorage.getItem(KEY_MARGENS));
      if (v && typeof v === 'object' && !Array.isArray(v)) guardadas = v;
    } catch (e) { /* usa as padrão */ }
    return Object.assign({}, MARGENS_PADRAO, guardadas);
  }

  function carregarPacotes() {
    let guardados = {};
    try {
      const v = JSON.parse(localStorage.getItem(KEY_PACOTES));
      if (v && typeof v === 'object' && !Array.isArray(v)) guardados = v;
    } catch (e) { /* usa os padrão */ }
    return Object.assign({}, PACOTES_PADRAO, guardados);
  }

  function guardarPacotes() {
    try { localStorage.setItem(KEY_PACOTES, JSON.stringify(pacotes)); } catch (e) { /* ignora */ }
  }

  function guardarMargens() {
    try { localStorage.setItem(KEY_MARGENS, JSON.stringify(margens)); } catch (e) { /* ignora */ }
  }

  function lerLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function escreverLS(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } }

  /* ---------- utilitários ---------- */
  const kz = n => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(n) + ' Kz';

  const dois = n => String(n).padStart(2, '0');
  const chave = ts => {
    const d = new Date(ts);
    return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate());
  };
  const hoje = () => chave(Date.now());
  const hora = ts => new Date(ts).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const dataLonga = ts => new Date(ts).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });

  const esc = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const gerarId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Aceita 923456789, 923 456 789, +244 923 456 789, 00244923456789
  function normalizarNumero(txt) {
    let d = String(txt || '').replace(/\D/g, '');
    if (d.startsWith('00244')) d = d.slice(5);
    else if (d.startsWith('244') && d.length > 9) d = d.slice(3);
    return d;
  }
  const numeroValido = n => /^\d{9}$/.test(n);
  const fmtNumero = n => String(n).replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');

  let temporizador;
  function aviso(texto) {
    const el = $('#aviso');
    el.textContent = texto;
    el.classList.add('mostra');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => el.classList.remove('mostra'), 2200);
  }

  // Itens finalizados no mesmo carrinho partilham o mesmo "lote" e contam como uma só venda
  const chaveVenda = v => v.lote || v.id;

  function agrupar(lista) {
    const mapa = new Map();
    for (const v of lista) {
      const k = chaveVenda(v);
      if (!mapa.has(k)) mapa.set(k, { key: k, ts: v.ts, pagamento: v.pagamento, itens: [], total: 0 });
      const g = mapa.get(k);
      g.itens.push(v);
      g.total += v.valor;
      if (v.ts < g.ts) g.ts = v.ts;
    }
    const grupos = [...mapa.values()];
    for (const g of grupos) g.itens.sort((a, b) => a.ts - b.ts);
    return grupos.sort((a, b) => b.ts - a.ts);
  }

  const margemDe = (tipo, operadora) => Number(margens[tipo + '|' + operadora]) || 0;

  // Lucro de um cartão = valor de venda - custo de um cartão (custo do pacote / quantidade)
  function lucroCartao(nome, valor) {
    const p = pacotes[nome];
    return p && p.custo > 0 && p.qtd > 0 ? valor - p.custo / p.qtd : 0;
  }

  // Cada venda guarda o lucro/margem do momento em que foi feita. As antigas usam os valores atuais.
  const lucroDe = v => {
    if (typeof v.lucro === 'number') return v.lucro;
    if (v.tipo === 'Cartão') return lucroCartao(v.operadora, v.valor);
    return v.valor * (typeof v.margem === 'number' ? v.margem : margemDe(v.tipo, v.operadora)) / 100;
  };

  function somar(lista) {
    const r = { total: 0, lucro: 0, n: new Set(lista.map(chaveVenda)).size, Dinheiro: 0, 'Transferência': 0, Multicaixa: 0 };
    for (const v of lista) {
      r.total += v.valor;
      r.lucro += lucroDe(v);
      r[v.pagamento] = (r[v.pagamento] || 0) + v.valor;
    }
    return r;
  }

  const plural = n => n + (n === 1 ? ' venda' : ' vendas');

  /* ---------- desenho ---------- */
  function itemHTML(v) {
    const partes = [
      v.numero ? fmtNumero(v.numero) : '',
      hora(v.ts),
      v.pagamento,
      v.nota || ''
    ].filter(Boolean).map(esc).join(' · ');
    return '<li class="item">' +
      '<div class="item-info"><strong>' + esc(v.tipo) + ' · ' + esc(v.operadora) + '</strong>' +
      '<small>' + partes + '</small></div>' +
      '<div class="item-dir"><span class="item-valor">' + kz(v.valor) + '</span>' +
      '<button type="button" class="apagar" data-key="' + esc(chaveVenda(v)) + '" aria-label="Apagar venda">✕</button></div>' +
      '</li>';
  }

  // Venda com vários itens: um só cartão com a lista lá dentro
  function grupoHTML(g) {
    if (g.itens.length === 1) return itemHTML(g.itens[0]);
    const linhas = g.itens.map(v => {
      const desc = [v.tipo, v.operadora, v.numero ? fmtNumero(v.numero) : ''].filter(Boolean).map(esc).join(' · ');
      return '<li><span>' + desc + '</span><b>' + kz(v.valor) + '</b></li>';
    }).join('');
    return '<li class="item grupo">' +
      '<div class="grupo-cab">' +
      '<div class="item-info"><strong>Venda · ' + g.itens.length + ' itens</strong>' +
      '<small>' + esc(hora(g.ts)) + ' · ' + esc(g.pagamento) + '</small></div>' +
      '<div class="item-dir"><span class="item-valor">' + kz(g.total) + '</span>' +
      '<button type="button" class="apagar" data-key="' + esc(g.key) + '" aria-label="Apagar venda">✕</button></div>' +
      '</div><ul class="sub">' + linhas + '</ul></li>';
  }

  function renderHoje() {
    const lista = vendas.filter(v => chave(v.ts) === hoje()).sort((a, b) => b.ts - a.ts);
    const t = somar(lista);
    $('#totalHoje').textContent = oculto ? '•••••• Kz' : kz(t.total);
    $('#nHoje').textContent = plural(t.n);
    $('#lucroHoje').textContent = 'Lucro: ' + (oculto ? '••••' : kz(t.lucro));
    $('#hojeDinheiro').textContent = kz(t.Dinheiro);
    $('#hojeTransferencia').textContent = kz(t['Transferência']);
    $('#hojeMulticaixa').textContent = kz(t.Multicaixa);
    $('#listaHoje').innerHTML = lista.length
      ? agrupar(lista).map(grupoHTML).join('')
      : '<li class="vazio">Ainda sem vendas hoje.</li>';
  }

  function filtrar(modo) {
    const agora = new Date();
    const h = hoje();
    if (modo === 'hoje') return vendas.filter(v => chave(v.ts) === h);
    if (modo === '7') {
      const ini = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 6).getTime();
      return vendas.filter(v => v.ts >= ini);
    }
    if (modo === 'mes') {
      const ini = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
      return vendas.filter(v => v.ts >= ini);
    }
    return vendas.slice();
  }

  function renderHistorico() {
    const lista = filtrar($('#filtro').value).sort((a, b) => b.ts - a.ts);
    const t = somar(lista);
    $('#totalPeriodo').textContent = kz(t.total);
    $('#nPeriodo').textContent = plural(t.n);
    $('#lucroPeriodo').textContent = 'Lucro: ' + kz(t.lucro);
    $('#perDinheiro').textContent = kz(t.Dinheiro);
    $('#perTransferencia').textContent = kz(t['Transferência']);
    $('#perMulticaixa').textContent = kz(t.Multicaixa);

    if (!lista.length) {
      $('#listaHistorico').innerHTML = '<p class="vazio">Sem vendas neste período.</p>';
      return;
    }

    const dias = new Map();
    for (const g of agrupar(lista)) {
      const k = chave(g.ts);
      if (!dias.has(k)) dias.set(k, []);
      dias.get(k).push(g);
    }

    let html = '';
    for (const [, gs] of dias) {
      const tot = gs.reduce((s, g) => s + g.total, 0);
      html += '<div class="dia-cab"><h3>' + esc(dataLonga(gs[0].ts)) + '</h3><span>' + kz(tot) + '</span></div>' +
        '<ul class="lista">' + gs.map(grupoHTML).join('') + '</ul>';
    }
    $('#listaHistorico').innerHTML = html;
  }

  function renderDefinicoes() {
    const ub = Number(lerLS(KEY_BACKUP));
    $('#ultimoBackup').textContent = ub
      ? 'Último backup: ' + new Date(ub).toLocaleString('pt-PT', { dateStyle: 'medium', timeStyle: 'short' })
      : 'Ainda não fizeste nenhum backup.';
  }

  function renderAvisoBackup() {
    let mostrar = false;
    if (vendas.length) {
      const ub = Number(lerLS(KEY_BACKUP));
      const ref = ub || Math.min(...vendas.map(v => v.ts));
      mostrar = Date.now() - ref > 7 * 24 * 3600 * 1000;
    }
    $('#avisoBackup').hidden = !mostrar;
  }

  function renderTudo() {
    renderHoje();
    renderHistorico();
    renderDefinicoes();
    renderAvisoBackup();
    renderCarrinho();
  }

  /* ---------- navegação ---------- */
  $$('.menu button').forEach(b => b.addEventListener('click', () => {
    $$('.menu button').forEach(x => x.classList.toggle('ativo', x === b));
    $$('.vista').forEach(s => s.classList.toggle('ativa', s.id === 'vista-' + b.dataset.vista));
    window.scrollTo(0, 0);
  }));

  /* ---------- formulário ---------- */
  function marcar(container, attr, valor) {
    $$('button', container).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === valor)));
  }

  // Opções de cada tipo. No cartão físico o valor vem já definido.
  const OPCOES = {
    'Recarga': [{ nome: 'Unitel' }, { nome: 'Africell' }, { nome: 'Zapadinha' }],
    'Cartão': [
      { nome: 'Africell 200', valor: 200 },
      { nome: 'Africell 500', valor: 500 },
      { nome: 'Unitel 500', valor: 500 },
      { nome: 'Unitel 1000', valor: 1000 }
    ]
  };

  function ajustarValor() {
    if (tipo !== 'Cartão') return;
    const o = OPCOES['Cartão'].find(x => x.nome === $('#operadora').value);
    if (o) $('#valor').value = o.valor;
  }

  function montarOperadoras() {
    const sel = $('#operadora');
    sel.innerHTML = OPCOES[tipo]
      .map(o => '<option value="' + esc(o.nome) + '">' + esc(o.nome) + '</option>').join('');
    const guardada = lerLS(KEY_OP + '-' + tipo);
    if (guardada && OPCOES[tipo].some(o => o.nome === guardada)) sel.value = guardada;
    $('#rotuloOperadora').textContent = tipo === 'Cartão' ? 'Cartão' : 'Operadora';
    $('#campoNumero').hidden = tipo === 'Cartão';
    ajustarPlaceholder();
    ajustarValor();
  }

  function ajustarPlaceholder() {
    $('#numero').placeholder = $('#operadora').value === 'Zapadinha' ? 'Número do cliente' : '9XX XXX XXX';
  }

  $('#segTipo').addEventListener('click', e => {
    const b = e.target.closest('button[data-tipo]');
    if (!b || b.dataset.tipo === tipo) return;
    tipo = b.dataset.tipo;
    marcar($('#segTipo'), 'tipo', tipo);
    $('#valor').value = '';
    $('#numero').classList.remove('erro');
    montarOperadoras();
  });

  $('#segPag').addEventListener('click', e => {
    const b = e.target.closest('button[data-pag]');
    if (!b) return;
    pagamento = b.dataset.pag;
    marcar($('#segPag'), 'pag', pagamento);
  });

  $('#operadora').addEventListener('change', e => {
    escreverLS(KEY_OP + '-' + tipo, e.target.value);
    $('#numero').classList.remove('erro');
    ajustarPlaceholder();
    ajustarValor();
  });

  $('#numero').addEventListener('input', () => $('#numero').classList.remove('erro'));

  /* ---------- carrinho ---------- */
  function carrinhoItemHTML(it, i) {
    const detalhe = [it.numero ? fmtNumero(it.numero) : '', it.nota || ''].filter(Boolean).map(esc).join(' · ');
    return '<li class="item">' +
      '<div class="item-info"><strong>' + esc(it.tipo) + ' · ' + esc(it.operadora) + '</strong>' +
      (detalhe ? '<small>' + detalhe + '</small>' : '') + '</div>' +
      '<div class="item-dir"><span class="item-valor">' + kz(it.valor) + '</span>' +
      '<button type="button" class="tirar" data-i="' + i + '" aria-label="Tirar do carrinho">✕</button></div>' +
      '</li>';
  }

  function atualizarFlutuante() {
    const f = $('#btnFlutuante');
    f.hidden = !carrinho.length || carrinhoVisivel;
  }

  function renderCarrinho() {
    const total = carrinho.reduce((s, i) => s + i.valor, 0);
    $('#carrinho').hidden = !carrinho.length;
    $('#listaCarrinho').innerHTML = carrinho.map(carrinhoItemHTML).join('');
    $('#nCarrinho').textContent = '(' + carrinho.length + (carrinho.length === 1 ? ' item' : ' itens') + ')';
    $('#totalCarrinho').textContent = kz(total);
    $('#btnFinalizar').textContent = 'Finalizar venda · ' + kz(total);
    $('#btnFlutuante').textContent = '🛒 ' + carrinho.length + ' · ' + kz(total);
    $('#badgeCarrinho').textContent = carrinho.length;
    $('#badgeCarrinho').hidden = !carrinho.length;
    // A lixeira só aparece com mais de um produto no carrinho
    $('#btnEsvaziar').hidden = carrinho.length < 2;
    $('#finalizarCaixa').classList.toggle('com-lixo', carrinho.length > 1);
    marcar($('#segPag'), 'pag', pagamento);
    atualizarFlutuante();
  }

  $('#form').addEventListener('submit', e => {
    e.preventDefault();

    let numero = '';
    if (tipo === 'Recarga') {
      // Zapadinha aceita números com mais de 9 dígitos; as outras operadoras têm 9
      const zap = $('#operadora').value === 'Zapadinha';
      numero = zap ? String($('#numero').value).replace(/\D/g, '') : normalizarNumero($('#numero').value);
      const ok = zap ? /^\d{9,20}$/.test(numero) : numeroValido(numero);
      if (!ok) {
        $('#numero').classList.add('erro');
        $('#numero').focus();
        aviso(!numero ? 'Põe o número do cliente.'
          : zap ? 'Número inválido: mínimo 9 dígitos.'
          : 'Número inválido: tem de ter 9 dígitos.');
        return;
      }
    }

    const valor = parseFloat(String($('#valor').value).replace(',', '.'));
    if (!(valor > 0)) {
      aviso('Põe um valor válido.');
      $('#valor').focus();
      return;
    }

    const item = {
      tipo,
      operadora: $('#operadora').value,
      valor,
      nota: ''
    };
    if (tipo === 'Recarga') item.numero = numero;

    carrinho.push(item);
    guardarCarrinho();

    $('#valor').value = '';
    $('#numero').value = '';
    ajustarValor();

    aviso('Adicionado ao carrinho (' + carrinho.length + ')');
    renderCarrinho();
  });

  document.addEventListener('click', e => {
    const t = e.target.closest('button.tirar');
    if (!t) return;
    const i = Number(t.dataset.i);
    if (!(i >= 0 && i < carrinho.length)) return;
    carrinho.splice(i, 1);
    guardarCarrinho();
    renderCarrinho();
  });

  $('#btnEsvaziar').addEventListener('click', () => {
    if (!carrinho.length) return;
    if (!confirm('Esvaziar o carrinho (' + carrinho.length + ' itens)?')) return;
    carrinho = [];
    guardarCarrinho();
    renderCarrinho();
  });

  $('#btnFinalizar').addEventListener('click', () => {
    if (!carrinho.length) return;
    const base = Date.now();
    const lote = gerarId();
    const novas = carrinho.map((it, i) => {
      const v = {
        id: gerarId(),
        lote,
        ts: base + i,
        tipo: it.tipo,
        operadora: it.operadora,
        valor: it.valor,
        margem: margemDe(it.tipo, it.operadora),
        lucro: it.tipo === 'Cartão'
          ? lucroCartao(it.operadora, it.valor)
          : it.valor * margemDe(it.tipo, it.operadora) / 100,
        pagamento,
        nota: it.nota || ''
      };
      if (it.numero) v.numero = it.numero;
      return v;
    });

    const antes = vendas;
    vendas = vendas.concat(novas);
    if (!guardar()) {
      vendas = antes;
      return;
    }

    carrinho = [];
    guardarCarrinho();
    pagamento = 'Dinheiro';
    aviso(novas.length === 1 ? 'Venda registada ✓' : novas.length + ' vendas registadas ✓');
    renderTudo();
    $('#listaHoje').scrollLeft = 0; // a venda nova aparece à frente no carrossel
    window.scrollTo(0, 0);
  });

  $('#btnFlutuante').addEventListener('click', () => {
    $('#carrinho').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entradas => {
      carrinhoVisivel = entradas[0].isIntersecting;
      atualizarFlutuante();
    }, { threshold: 0.15 }).observe($('#carrinho'));
  }

  /* ---------- apagar uma venda ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('button.apagar');
    if (!b) return;
    const key = b.dataset.key;
    const itens = vendas.filter(x => chaveVenda(x) === key);
    if (!itens.length) return;
    const total = itens.reduce((s, x) => s + x.valor, 0);
    const msg = itens.length === 1
      ? 'Apagar esta venda de ' + kz(total) + '?'
      : 'Apagar a venda inteira (' + itens.length + ' itens, ' + kz(total) + ')?';
    if (!confirm(msg)) return;
    const antes = vendas;
    vendas = vendas.filter(x => chaveVenda(x) !== key);
    if (!guardar()) { vendas = antes; return; }
    aviso('Venda apagada');
    renderTudo();
  });

  $('#filtro').addEventListener('change', renderHistorico);

  /* ---------- margem de lucro (Definições) ---------- */
  const NOMES_MARGEM = {
    'Recarga|Unitel': 'Recarga · Unitel (Unitel Money)',
    'Recarga|Africell': 'Recarga · Africell (Afrimoney)'
  };

  function renderMargens() {
    let html = '';
    let i = 0;
    for (const o of OPCOES['Recarga']) {
      const k = 'Recarga|' + o.nome;
      const nome = NOMES_MARGEM[k] || 'Recarga · ' + o.nome;
      html += '<div class="margem-linha"><label for="margem-' + i + '">' + esc(nome) + '</label>' +
        '<div class="margem-campo"><input id="margem-' + i + '" type="number" inputmode="decimal" step="any" min="0" max="100" ' +
        'data-k="' + esc(k) + '" value="' + (Number(margens[k]) || 0) + '"><span>%</span></div></div>';
      i++;
    }
    $('#listaMargens').innerHTML = html;
  }

  /* ---------- cartões: custo do pacote (Definições) ---------- */
  function renderPacotes() {
    let html = '';
    OPCOES['Cartão'].forEach((o, i) => {
      const p = pacotes[o.nome] || {};
      const lc = lucroCartao(o.nome, o.valor);
      html += '<div class="pacote">' +
        '<div class="pacote-nome">' + esc(o.nome) + '</div>' +
        '<div class="pacote-campos">' +
        '<div><label for="pac-c-' + i + '">Custo do pacote (Kz)</label>' +
        '<input id="pac-c-' + i + '" type="number" inputmode="decimal" step="any" min="0" data-p="' + esc(o.nome) + '" data-f="custo" value="' + (p.custo || '') + '" placeholder="0"></div>' +
        '<div><label for="pac-q-' + i + '">Cartões no pacote</label>' +
        '<input id="pac-q-' + i + '" type="number" inputmode="numeric" step="1" min="1" data-p="' + esc(o.nome) + '" data-f="qtd" value="' + (p.qtd || '') + '" placeholder="0"></div>' +
        '</div>' +
        '<div class="pacote-lucro">' + (p.custo > 0 && p.qtd > 0
          ? 'Lucro por cartão: <b>' + kz(lc) + '</b> · pacote completo: <b>' + kz(lc * p.qtd) + '</b>'
          : 'Sem custo definido: lucro conta como 0') + '</div>' +
        '</div>';
    });
    $('#listaPacotes').innerHTML = html;
  }

  $('#listaPacotes').addEventListener('change', e => {
    const inp = e.target.closest('input[data-p]');
    if (!inp) return;
    const nome = inp.dataset.p;
    const campo = inp.dataset.f;
    const n = parseFloat(String(inp.value).replace(',', '.'));
    const atual = Object.assign({}, pacotes[nome]);
    if (inp.value.trim() === '') {
      delete atual[campo];
    } else if (n >= 0 && (campo !== 'qtd' || n >= 1)) {
      atual[campo] = campo === 'qtd' ? Math.round(n) : n;
    } else {
      aviso(campo === 'qtd' ? 'Põe pelo menos 1 cartão.' : 'Põe um custo válido.');
      inp.value = atual[campo] || '';
      return;
    }
    pacotes[nome] = atual;
    guardarPacotes();
    renderPacotes();
    renderHoje();
    renderHistorico();
    aviso('Custo guardado ✓');
  });

  $('#listaMargens').addEventListener('change', e => {
    const inp = e.target.closest('input[data-k]');
    if (!inp) return;
    const m = parseFloat(String(inp.value).replace(',', '.'));
    if (!(m >= 0 && m <= 100)) {
      aviso('Põe uma percentagem entre 0 e 100.');
      inp.value = Number(margens[inp.dataset.k]) || 0;
      return;
    }
    margens[inp.dataset.k] = m;
    guardarMargens();
    renderHoje();
    renderHistorico();
    aviso('Margem guardada ✓');
  });

  /* ---------- backup, importar, CSV ---------- */
  function baixar(nome, texto, mime) {
    const blob = new Blob([texto], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function exportarBackup() {
    if (!vendas.length) { aviso('Ainda não há vendas para guardar.'); return; }
    const dados = { app: 'saldar-life', versao: 4, exportado: new Date().toISOString(), margens, pacotes, vendas };
    baixar('saldar-life-backup-' + hoje() + '.json', JSON.stringify(dados, null, 2), 'application/json');
    escreverLS(KEY_BACKUP, String(Date.now()));
    aviso('Backup criado ✓');
    renderDefinicoes();
    renderAvisoBackup();
  }

  $('#btnExportar').addEventListener('click', exportarBackup);
  $('#btnBackupRapido').addEventListener('click', exportarBackup);

  $('#btnImportar').addEventListener('click', () => $('#ficheiroImport').click());

  $('#ficheiroImport').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const dados = JSON.parse(leitor.result);
        const lista = Array.isArray(dados) ? dados : dados.vendas;
        if (!Array.isArray(lista)) throw new Error('formato');
        if (!Array.isArray(dados) && dados.margens && typeof dados.margens === 'object') {
          for (const [k, m] of Object.entries(dados.margens)) {
            const n = Number(m);
            if (Number.isFinite(n) && n >= 0 && n <= 100) margens[k] = n;
          }
          guardarMargens();
          renderMargens();
        }
        if (!Array.isArray(dados) && dados.pacotes && typeof dados.pacotes === 'object') {
          for (const [k, p] of Object.entries(dados.pacotes)) {
            if (p && p.custo >= 0 && p.qtd >= 1) pacotes[k] = { custo: Number(p.custo), qtd: Math.round(p.qtd) };
          }
          guardarPacotes();
          renderPacotes();
        }
        const ids = new Set(vendas.map(v => v.id));
        let novas = 0;
        for (const v of lista) {
          if (!v || typeof v.id !== 'string' || !Number.isFinite(v.ts) || !(Number(v.valor) > 0)) continue;
          if (ids.has(v.id)) continue;
          const nova = {
            id: v.id,
            ts: v.ts,
            tipo: v.tipo === 'Cartão' ? 'Cartão' : 'Recarga',
            operadora: String(v.operadora || 'Outro'),
            valor: Number(v.valor),
            pagamento: PAGAMENTOS.includes(v.pagamento) ? v.pagamento : 'Dinheiro',
            nota: String(v.nota || '')
          };
          if (/^\d{9,20}$/.test(String(v.numero || ''))) nova.numero = String(v.numero);
          if (typeof v.lote === 'string' && v.lote) nova.lote = v.lote;
          if (typeof v.margem === 'number' && v.margem >= 0 && v.margem <= 100) nova.margem = v.margem;
          if (typeof v.lucro === 'number' && Number.isFinite(v.lucro)) nova.lucro = v.lucro;
          vendas.push(nova);
          ids.add(v.id);
          novas++;
        }
        guardar();
        renderTudo();
        aviso(novas ? novas + ' vendas importadas ✓' : 'Nada de novo para importar.');
      } catch (err) {
        aviso('Ficheiro inválido.');
      }
    };
    leitor.onerror = () => aviso('Não consegui ler o ficheiro.');
    leitor.readAsText(f);
  });

  $('#btnCSV').addEventListener('click', () => {
    if (!vendas.length) { aviso('Ainda não há vendas.'); return; }
    const campo = s => '"' + String(s).replace(/"/g, '""') + '"';
    const linhas = ['data;hora;tipo;operadora;numero;valor;lucro;pagamento;nota;venda'];
    for (const v of vendas.slice().sort((a, b) => a.ts - b.ts)) {
      const lucro = String(Math.round(lucroDe(v) * 100) / 100).replace('.', ',');
      linhas.push([chave(v.ts), hora(v.ts), v.tipo, v.operadora, v.numero || '', String(v.valor).replace('.', ','), lucro, v.pagamento, v.nota, chaveVenda(v)]
        .map(campo).join(';'));
    }
    baixar('saldar-life-vendas-' + hoje() + '.csv', '﻿' + linhas.join('\n'), 'text/csv;charset=utf-8');
    aviso('CSV criado ✓');
  });

  $('#btnApagarTudo').addEventListener('click', () => {
    if (!vendas.length) { aviso('Não há vendas para apagar.'); return; }
    if (!confirm('Apagar TODAS as ' + vendas.length + ' vendas? Não dá para desfazer.')) return;
    if (!confirm('Tens a certeza? Faz backup antes se ainda precisares destes dados.')) return;
    const antes = vendas;
    vendas = [];
    if (!guardar()) { vendas = antes; return; }
    aviso('Tudo apagado');
    renderTudo();
  });

  /* ---------- olho: mostrar / ocultar total e lucro ---------- */
  const ICONE_OLHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const ICONE_OLHO_FECHADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function atualizarOlho() {
    const b = $('#btnOlho');
    b.innerHTML = oculto ? ICONE_OLHO_FECHADO : ICONE_OLHO;
    b.setAttribute('aria-label', oculto ? 'Mostrar valores' : 'Ocultar valores');
    b.setAttribute('aria-pressed', String(oculto));
  }

  $('#btnOlho').addEventListener('click', () => {
    oculto = !oculto;
    escreverLS(KEY_OCULTO, oculto ? '1' : '0');
    atualizarOlho();
    renderHoje();
  });

  /* ---------- tela cheia (Definições) ---------- */
  const elTela = document.documentElement;
  const emTela = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const pedirTela = elTela.requestFullscreen || elTela.webkitRequestFullscreen;
  const sairTela = document.exitFullscreen || document.webkitExitFullscreen;

  function atualizarTela() {
    $('#btnTelaCheia').textContent = emTela() ? 'Sair da tela cheia' : 'Ativar tela cheia';
  }

  if (!pedirTela) {
    // Navegador sem suporte (ex.: iPhone): explica em vez de esconder
    $('#btnTelaCheia').disabled = true;
    $('#btnTelaCheia').textContent = 'Não disponível neste navegador';
  }

  $('#btnTelaCheia').addEventListener('click', () => {
    try {
      const r = emTela() ? sairTela.call(document) : pedirTela.call(elTela);
      if (r && r.catch) r.catch(() => aviso('Não foi possível mudar o modo de ecrã.'));
    } catch (e) {
      aviso('Não foi possível mudar o modo de ecrã.');
    }
  });

  document.addEventListener('fullscreenchange', atualizarTela);
  document.addEventListener('webkitfullscreenchange', atualizarTela);

  /* ---------- estado da rede ---------- */
  function atualizarRede() {
    const el = $('#estadoRede');
    const on = navigator.onLine;
    el.textContent = on ? 'online' : 'offline';
    el.classList.toggle('off', !on);
  }
  window.addEventListener('online', atualizarRede);
  window.addEventListener('offline', atualizarRede);

  /* ---------- arranque ---------- */
  $('#dataHoje').textContent = dataLonga(Date.now());
  atualizarRede();
  montarOperadoras();
  renderMargens();
  renderPacotes();
  atualizarOlho();
  renderTudo();

  // Se a data mudar com a app aberta (passou da meia-noite), atualiza ao voltar à app
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      $('#dataHoje').textContent = dataLonga(Date.now());
      renderTudo();
    }
  });

  // Pede ao navegador para não apagar os dados guardados
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
