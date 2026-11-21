import { t, L, getLang, applyLang, toggleLang, onLangChange } from '../shared/i18n.js';
import { backend, authErrorKey, isOwnerEmail, OWNER_EMAILS, mergeSettings } from '../shared/backend.js';
import {
  h, fmtSAR, fmtDate, toast, sheet, confirmBox, field, isEmail, imagePicker, badge, statusKind, payKind,
  empty, langButton, demoBanner, waLink, errMsg
} from '../shared/ui.js';

applyLang();

const S = { user: undefined, settings: null, products: null, orders: null, services: [], ofilter: 'pending', otab: 'orders', pq: '' };
const draft = { product: null, settings: null };
let unsubs = [], knownOrders = null;
const authMsg = (e) => { const m = authErrorKey(e); return m ? m[getLang() === 'ar' ? 1 : 0] : errMsg(e); };
const nm = (it) => getLang() === 'ar' ? (it.nameAr || it.nameEn) : (it.nameEn || it.nameAr);

const app = document.getElementById('app');

function alertNew(list) {
  const ids = new Set(list.map(o => o.id));
  if (knownOrders) {
    const fresh = list.filter(o => !knownOrders.has(o.id));
    if (fresh.length) {
      toast('🔔 ' + t('newOrderAlert') + ' ' + fresh[0].orderNo, 'ok');
      try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
      beep();
    }
  }
  knownOrders = ids;
}
function beep() {
  try {
    const C = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach(d => { const o = C.createOscillator(), g = C.createGain(); o.frequency.value = 880; o.connect(g); g.connect(C.destination);
      g.gain.setValueAtTime(0.2, C.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, C.currentTime + d + 0.2); o.start(C.currentTime + d); o.stop(C.currentTime + d + 0.22); });
  } catch (e) {}
}

function route() { const p = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/'); return { name: p[0] || 'dashboard', arg: p[1] }; }
const LIVE = new Set(['dashboard', 'orders', 'order', 'products', 'inventory']);

function render(fromData) {
  const r = route();
  if (fromData && !LIVE.has(r.name)) return;
  if (S.user === undefined) { app.replaceChildren(header(), h('div.spinner')); return; }
  if (!S.user || !isOwnerEmail(S.user.email)) { app.replaceChildren(header(), demoBanner(backend.mode), h('main', loginView())); return; }
  if (!S.settings || !S.products || !S.orders) { app.replaceChildren(header(), h('div.spinner')); return; }
  const y = window.scrollY;
  const views = { dashboard, orders, order, products, product, inventory, settings };
  app.replaceChildren(header(), demoBanner(backend.mode), h('main', (views[r.name] || dashboard)(r.arg)), nav(r.name));
  if (fromData) window.scrollTo(0, y);
}

function header() {
  return h('header.topbar',
    h('a.brand', { href: '#/dashboard', style: 'color:#fff;text-decoration:none' }, h('div.logo', '⚡'),
      h('div', h('h1', S.settings ? L(S.settings, 'storeName') : t('appName')), h('small', '🔑 ' + t('ownerApp')))),
    langButton(toggleLang));
}
function nav(active) {
  const pend = (S.orders || []).filter(o => o.status === 'pending').length + S.services.filter(s => s.status === 'new').length;
  const low = (S.products || []).filter(p => (p.stock || 0) <= (p.lowStock ?? 5)).length;
  const items = [['dashboard', '📊', t('dashboard')], ['orders', '📦', t('orders'), pend], ['products', '🏷️', t('products')], ['inventory', '📋', t('inventory'), low], ['settings', '⚙️', t('settings')]];
  return h('nav.bottomnav', items.map(([k, ic, label, n]) =>
    h('a' + (active === k || (k === 'orders' && active === 'order') || (k === 'products' && active === 'product') ? '.on' : ''), { href: '#/' + k }, h('span.ic', ic), label, n ? h('span.dot', n) : null)));
}

// ------------------------------------------------------------------ auth
function loginView() {
  const v = { email: OWNER_EMAILS[0] || '', password: '' };
  const mk = (k, a) => { const el = h('input', { ...a, value: v[k] }); el.addEventListener('input', () => { v[k] = el.value; }); return el; };
  const err = h('div');
  const btn = h('button.btn.block', { onclick: go }, t('login'));
  async function go() {
    err.replaceChildren();
    if (!isOwnerEmail(v.email)) { err.appendChild(h('div.errbox', t('notOwner'))); return; }
    btn.disabled = true;
    try { await backend.auth.signIn(v.email, v.password); } catch (e) { err.appendChild(h('div.errbox', authMsg(e))); btn.disabled = false; }
  }
  const pw = mk('password', { type: 'password', autocomplete: 'current-password' });
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div.auth-wrap', h('div.auth-logo', '🔑'), h('h2.center', t('ownerLogin')),
    S.user && !isOwnerEmail(S.user.email) ? h('div.errbox', t('notOwner'), ' ', h('button.link-btn', { onclick: () => backend.auth.signOut() }, t('logout'))) : null,
    h('div.card', field(t('email'), mk('email', { type: 'email', class: 'ltr', autocomplete: 'email' })), field(t('password'), pw), err, btn,
      h('div.center.mt', h('button.link-btn', { onclick: async () => { try { await backend.auth.reset(v.email); toast(t('resetSent'), 'ok'); } catch (e) { toast(authMsg(e), 'err'); } } }, t('forgot'))),
      backend.mode === 'demo' ? h('div.warnbox', 'Demo: ' + OWNER_EMAILS[0] + ' / demo1234') : null));
}

// ------------------------------------------------------------------ dashboard
function dashboard() {
  const O = S.orders, P = S.products;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const live = O.filter(o => o.status !== 'cancelled');
  const today = live.filter(o => o.createdAt >= start.getTime());
  const pending = O.filter(o => o.status === 'pending');
  const low = P.filter(p => (p.stock || 0) <= (p.lowStock ?? 5));
  const revenue = O.filter(o => o.status === 'delivered').reduce((s, o) => s + o.total, 0);
  const newSv = S.services.filter(s => s.status === 'new');
  return h('div',
    h('div.stats',
      stat(fmtSAR(today.reduce((s, o) => s + o.total, 0)), t('todaySales') + ' (' + today.length + ')'),
      stat(pending.length, t('pendingOrders'), pending.length > 0, '#/orders'),
      stat(low.length, t('lowStock'), low.length > 0, '#/inventory'),
      stat(fmtSAR(revenue), t('revenue'))),
    newSv.length ? h('a.warnbox', { href: '#/orders', onclick: () => { S.otab = 'services'; }, style: 'display:block;text-decoration:none' }, '🔧 ' + t('serviceRequests') + ': ' + newSv.length + ' ' + t('sv_new')) : null,
    h('div.row.gap.mb', h('a.btn.grow', { href: '#/product/new' }, '+ ' + t('addProduct')), h('a.btn.ghost.grow', { href: '#/settings' }, '💳 ' + t('paymentSettings'))),
    h('div.card', h('div.row.between', h('h3', t('recentOrders')), h('a.small', { href: '#/orders', onclick: () => { S.ofilter = 'all'; } }, t('all'))),
      O.length ? O.slice(0, 6).map(orderRow) : h('p.muted', t('noOrders'))),
    low.length ? h('div.card', h('h3', '⚠️ ' + t('lowStock')), low.slice(0, 8).map(p => h('div.sumrow', h('span', nm(p)), h('b', { style: 'color:var(--red)' }, (p.stock || 0) + ' ' + t('units'))))) : null,
    h('div.small.muted.center.mt', t('firebaseStatus') + ': ' + (backend.mode === 'firebase' ? '🟢 ' + t('connected') : '🟡 ' + t('demoMode'))));
}
function stat(v, k, alert, href) { return h(href ? 'a.stat' : 'div.stat', { class: alert ? 'alert' : '', href, style: 'text-decoration:none;color:inherit' }, h('div.v', v), h('div.k', k)); }
function orderRow(o) {
  const p = o.payment || {};
  return h('a.list-item', { href: '#/order/' + o.id, style: 'text-decoration:none;color:inherit' },
    h('div.grow', h('div.row.between', h('b', { style: 'direction:ltr;unicode-bidi:plaintext' }, o.orderNo), h('b.price', fmtSAR(o.total))),
      h('div.small.muted', o.customer.name + ' • ' + o.customer.city + ' • ' + fmtDate(o.createdAt)),
      h('div.row.gap', { style: 'margin-top:4px' }, badge(t('st_' + o.status), statusKind[o.status]), badge(t(p.method || 'cod') + ' · ' + t('ps_' + (p.status || 'pending')), payKind[p.status || 'pending']))));
}

// ------------------------------------------------------------------ orders + repair
function orders() {
  const tabs = h('div.seg', h('button' + (S.otab === 'orders' ? '.on' : ''), { onclick: () => { S.otab = 'orders'; render(); } }, '📦 ' + t('orders')),
    h('button' + (S.otab === 'services' ? '.on' : ''), { onclick: () => { S.otab = 'services'; render(); } }, '🔧 ' + t('serviceRequests')));
  if (S.otab === 'services') return h('div', tabs, services());
  const filters = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'all'];
  const list = S.orders.filter(o => S.ofilter === 'all' || o.status === S.ofilter);
  return h('div', tabs,
    h('div.chips', filters.map(f => h('button.chip' + (S.ofilter === f ? '.on' : ''), { onclick: () => { S.ofilter = f; render(); } },
      (f === 'all' ? t('filterAll') : t('st_' + f)) + ' (' + (f === 'all' ? S.orders.length : S.orders.filter(o => o.status === f).length) + ')'))),
    list.length ? h('div.card', list.map(orderRow)) : empty('📭', t('noOrders')));
}

function services() {
  if (!S.services.length) return empty('🔧', t('noRequests'));
  const kinds = { new: 'warn', scheduled: 'info', in_progress: 'info', done: 'ok', cancelled: 'bad' };
  return h('div', S.services.map(sv => {
    const note = h('input', { value: sv.ownerNote || '', placeholder: t('ownerNote') });
    const sel = h('select', ['new', 'scheduled', 'in_progress', 'done', 'cancelled'].map(k => h('option', { value: k }, t('sv_' + k))));
    sel.value = sv.status;
    return h('div.card',
      h('div.row.between', h('b', t('dev_' + sv.deviceType)), badge(t('sv_' + sv.status), kinds[sv.status])),
      h('div', sv.problem), h('div.small.muted', sv.name + ' • ', h('span', { style: 'direction:ltr;unicode-bidi:plaintext' }, sv.phone)),
      h('div.small.muted', sv.address + (sv.preferredDate ? ' • 📅 ' + sv.preferredDate : '') + ' • ' + fmtDate(sv.createdAt)),
      h('div.row.gap.mt', h('a.btn.ghost.sm', { href: 'tel:' + sv.phone }, '📞'), h('a.btn.ghost.sm', { href: waLink(sv.phone) }, '💬')),
      h('div.field.mt', h('span.lbl', t('setStatus')), sel), h('div.field', note),
      h('button.btn.sm', { onclick: async () => { try { await backend.updateService(sv.id, { status: sel.value, ownerNote: note.value.trim() }); toast(t('saved'), 'ok'); render(); } catch (e) { toast(errMsg(e), 'err'); } } }, t('save')));
  }));
}

function order(id) {
  const o = S.orders.find(x => x.id === id);
  if (!o) return empty('❓', t('noOrders'));
  const p = o.payment || {}, s = S.settings;
  const act = async (fn, okMsg) => { try { await fn(); toast(okMsg || t('saved'), 'ok'); } catch (e) { console.error(e); toast(errMsg(e), 'err'); } };
  const setSt = (st) => act(() => backend.setOrderStatus(o.id, st), t('st_' + st));
  const setPay = (st) => act(() => backend.updateOrder(o.id, { payment: { ...p, status: st } }), t('ps_' + st));
  const next = { pending: ['confirmed'], confirmed: ['processing', 'shipped'], processing: ['shipped'], shipped: ['delivered'] }[o.status] || [];
  const labels = { confirmed: '✅ ' + t('confirmOrder'), processing: '🧰 ' + t('markProcessing'), shipped: '🚚 ' + t('markShipped'), delivered: '📬 ' + t('markDelivered') };
  const priceWarn = o.items.filter(it => { const pr = S.products.find(x => x.id === it.productId); return pr && Number(pr.price) !== Number(it.price); });
  const stockWarn = o.stockDeducted ? [] : o.items.filter(it => { const pr = S.products.find(x => x.id === it.productId); return !pr || (pr.stock || 0) < it.qty; });
  const msg = (getLang() === 'ar' ? 'مرحبًا ' : 'Hello ') + o.customer.name + ' — ' + o.orderNo + ': ' + t('st_' + o.status);
  return h('div',
    h('button.link-btn', { onclick: () => { location.hash = '#/orders'; } }, getLang() === 'ar' ? '→ ' : '← ', t('orders')),
    h('div.card',
      h('div.row.between', h('h3', { style: 'margin:0;direction:ltr;unicode-bidi:plaintext' }, o.orderNo), badge(t('st_' + o.status), statusKind[o.status])),
      h('div.small.muted', fmtDate(o.createdAt)),
      o.stockDeducted ? h('div.small', { style: 'color:var(--green-d)' }, '✓ ' + t('stockDeducted')) : null,
      stockWarn.length ? h('div.errbox', t('insufficientStock', { n: stockWarn.map(nm).join(', ') })) : null,
      next.length ? h('div.row.gap.wrap.mt', next.map(st => h('button.btn.grow', { onclick: () => setSt(st) }, labels[st]))) : null,
      !['cancelled', 'delivered'].includes(o.status) ? h('button.btn.danger.ghost.block.mt', { onclick: async () => { if (await confirmBox(t('confirmCancel'))) setSt('cancelled'); } }, t('cancelOrder')) : null),
    h('div.card', h('h3', t('customer')),
      h('div', h('b', o.customer.name)), h('div', { style: 'direction:ltr;unicode-bidi:plaintext;text-align:start' }, o.customer.phone), o.customer.email ? h('div.small.muted', o.customer.email) : null,
      h('div.small', [o.customer.address, o.customer.district, o.customer.city].filter(Boolean).join('، ')),
      (o.extra || []).map(x => h('div.small', h('b', L(x, 'label') + ': '), x.value)),
      o.notes ? h('div.warnbox', '📝 ' + o.notes) : null,
      h('div.row.gap.mt', h('a.btn.ghost.grow', { href: 'tel:' + o.customer.phone }, '📞 ', t('call')), h('a.btn.ghost.grow', { href: waLink(o.customer.phone, msg) }, '💬 ', t('whatsapp')),
        h('a.btn.ghost.sm', { href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([o.customer.address, o.customer.district, o.customer.city, 'Saudi Arabia'].join(', ')) }, '📍'))),
    h('div.card', h('h3', t('items')),
      o.items.map(it => h('div.sumrow', h('span', nm(it) + ' × ' + it.qty + (it.sku ? ' (' + it.sku + ')' : '')), h('span', fmtSAR(it.price * it.qty)))),
      priceWarn.length ? h('div.warnbox', '⚠️ ' + t('priceChanged') + ': ' + priceWarn.map(nm).join(', ')) : null,
      h('hr'),
      h('div.sumrow', h('span', t('subtotal')), h('span', fmtSAR(o.subtotal))), h('div.sumrow', h('span', t('delivery')), h('span', fmtSAR(o.deliveryFee))),
      h('div.sumrow.small.muted', h('span', t('vat')), h('span', fmtSAR(o.vat))), h('div.sumrow.total', h('span', t('total')), h('span', fmtSAR(o.total)))),
    h('div.card', h('h3', '💳 ' + t('payment')),
      h('div.row.between', h('b', t(p.method || 'cod')), badge(t('ps_' + (p.status || 'pending')), payKind[p.status || 'pending'])),
      p.reference ? h('div.paybox', h('div.kv', h('span.muted', t('reference')), h('b', p.reference))) : null,
      p.moyasarId ? h('div.paybox', h('div.kv', h('span.muted', t('moyasarId')), h('b', p.moyasarId))) : null,
      p.method === 'card' && p.status === 'paid' ? h('div.warnbox', t('verifyGateway')) : null,
      p.message ? h('div.small.muted', p.message) : null,
      p.receipt ? h('div', h('div.small.mt', h('b', t('receipt'))), h('img.receipt-img', { src: p.receipt, alt: 'receipt', onclick: () => sheet(t('receipt'), h('img', { src: p.receipt, style: 'width:100%' })) })) : null,
      p.status !== 'paid' && o.status !== 'cancelled' ? h('div.row.gap.mt', h('button.btn.grow', { onclick: () => setPay('paid') }, '✓ ' + t('markPaid')),
        p.status !== 'failed' ? h('button.btn.danger.ghost.grow', { onclick: () => setPay('failed') }, t('rejectPayment')) : null) : null,
      p.status === 'paid' && o.status === 'cancelled' ? h('button.btn.ghost.block.mt', { onclick: () => setPay('refunded') }, t('ps_refunded')) : null),
    h('div.card', h('h3', t('status')), h('ul.timeline', (o.history || []).slice().reverse().map(x => h('li', h('b', t('st_' + x.status)), ' — ', h('span.muted', fmtDate(x.at)), x.by === 'customer' ? ' (' + t('customer') + ')' : '')))));
}

// ------------------------------------------------------------------ products
function catName(id) { const c = S.settings.categories.find(x => x.id === id); return c ? (getLang() === 'ar' ? c.ar : c.en) : ''; }

function products() {
  const q = S.pq.toLowerCase();
  const list = S.products.filter(p => !q || (p.nameEn + ' ' + p.nameAr + ' ' + (p.sku || '')).toLowerCase().includes(q));
  const box = h('div.card');
  const draw = (l) => box.replaceChildren(...(l.length ? l.map(p => h('a.list-item', { href: '#/product/' + p.id, style: 'text-decoration:none;color:inherit' },
    p.image ? h('img.thumb', { src: p.image, alt: '' }) : h('div.thumb'),
    h('div.grow', h('b', nm(p)), h('div.small.muted', catName(p.category) + (p.sku ? ' • ' + p.sku : '')),
      h('div.row.gap', h('span.price', fmtSAR(p.price)), badge((p.stock || 0) + ' ' + t('units'), (p.stock || 0) <= 0 ? 'bad' : (p.stock || 0) <= (p.lowStock ?? 5) ? 'warn' : 'ok'),
        p.active === false ? badge('🚫', 'neutral') : null)), h('span.muted', '›'))) : [empty('🏷️', t('noProducts'))]));
  draw(list);
  const inp = h('input', { type: 'search', placeholder: t('search'), value: S.pq });
  inp.addEventListener('input', () => { S.pq = inp.value; const qq = S.pq.toLowerCase(); draw(S.products.filter(p => !qq || (p.nameEn + ' ' + p.nameAr + ' ' + (p.sku || '')).toLowerCase().includes(qq))); });
  return h('div', h('div.row.between', h('h2', t('products') + ' (' + S.products.length + ')'), h('a.btn.sm', { href: '#/product/new' }, '+ ' + t('add'))), h('div.search', inp), box);
}

function product(id) {
  const existing = id !== 'new' ? S.products.find(p => p.id === id) : null;
  if (id !== 'new' && !existing) return empty('❓', t('noProducts'));
  if (!draft.product || draft.product._for !== id) {
    draft.product = existing ? { ...existing, _for: id } : { _for: id, nameEn: '', nameAr: '', descEn: '', descAr: '', category: S.settings.categories[0]?.id || '', price: '', oldPrice: '', stock: '', lowStock: 5, sku: '', image: '', active: true };
  }
  const d = draft.product;
  const bind = (k, a = {}) => { const tag = a.tag || 'input'; delete a.tag; const el = h(tag, { ...a, value: d[k] ?? '' }); el.addEventListener('input', () => { d[k] = el.value; el.closest('.field')?.classList.remove('invalid'); }); el.addEventListener('change', () => { d[k] = el.value; }); return el; };
  const cat = bind('category', { tag: 'select' }); S.settings.categories.forEach(c => cat.appendChild(h('option', { value: c.id }, getLang() === 'ar' ? c.ar : c.en))); cat.value = d.category;
  const act = h('input', { type: 'checkbox', checked: d.active !== false }); act.addEventListener('change', () => { d.active = act.checked; });
  const req = (k, label, el) => { const w = field(h('span', label, h('span.req', ' *')), el); w.dataset.key = k; return w; };
  const btn = h('button.btn.block', { onclick: save }, t('save'));
  const form = h('div',
    h('button.link-btn', { onclick: () => { draft.product = null; location.hash = '#/products'; } }, getLang() === 'ar' ? '→ ' : '← ', t('products')),
    h('h2', existing ? t('editProduct') : t('addProduct')),
    h('div.card',
      field(t('image'), imagePicker(d.image, (url) => { d.image = url; })),
      req('nameEn', t('nameEn'), bind('nameEn', { dir: 'ltr' })),
      req('nameAr', t('nameAr'), bind('nameAr', { dir: 'rtl' })),
      field(t('category'), cat),
      h('div.grid2', req('price', t('price') + ' (SAR)', bind('price', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01' })), field(t('oldPrice'), bind('oldPrice', { type: 'number', inputmode: 'decimal', min: 0, step: '0.01' }))),
      h('div.grid2', req('stock', t('stock'), bind('stock', { type: 'number', inputmode: 'numeric', min: 0, step: 1 })), field(t('lowStockAt'), bind('lowStock', { type: 'number', inputmode: 'numeric', min: 0 }))),
      field(t('sku'), bind('sku', { class: 'ltr' })),
      field(t('descEn'), bind('descEn', { tag: 'textarea', dir: 'ltr' })),
      field(t('descAr'), bind('descAr', { tag: 'textarea', dir: 'rtl' })),
      h('label.check', act, t('active')),
      h('div.small.muted.mb', t('vatIncluded'))),
    h('div.mt', btn),
    existing ? h('button.btn.danger.ghost.block.mt', { onclick: async () => {
      if (!(await confirmBox(t('confirmDelete')))) return;
      try { await backend.deleteProduct(existing.id); draft.product = null; toast(t('delete'), 'ok'); location.hash = '#/products'; } catch (e) { toast(errMsg(e), 'err'); }
    } }, '🗑 ' + t('delete')) : null);

  async function save() {
    form.querySelectorAll('.field').forEach(x => { x.classList.remove('invalid'); });
    const bad = [];
    if (!String(d.nameEn).trim() && !String(d.nameAr).trim()) bad.push('nameEn', 'nameAr');
    if (!(Number(d.price) > 0)) bad.push('price');
    if (d.stock === '' || !(Number(d.stock) >= 0) || !Number.isInteger(Number(d.stock))) bad.push('stock');
    if (bad.length) { bad.forEach(k => form.querySelector(`.field[data-key="${k}"]`)?.classList.add('invalid')); toast(t('required'), 'err'); return; }
    btn.disabled = true;
    const data = {
      nameEn: String(d.nameEn).trim(), nameAr: String(d.nameAr).trim(), descEn: String(d.descEn || '').trim(), descAr: String(d.descAr || '').trim(),
      category: d.category, price: Math.round(Number(d.price) * 100) / 100, oldPrice: Number(d.oldPrice) > 0 ? Number(d.oldPrice) : null,
      stock: Number(d.stock), lowStock: Number(d.lowStock) || 0, sku: String(d.sku || '').trim(), image: d.image || '', active: d.active !== false,
    };
    if (existing) data.id = existing.id;
    try { await backend.saveProduct(data); draft.product = null; toast(t('productSaved'), 'ok'); location.hash = '#/products'; }
    catch (e) { console.error(e); toast(errMsg(e), 'err'); btn.disabled = false; }
  }
  return form;
}

// ------------------------------------------------------------------ inventory
function inventory() {
  const list = S.products.slice().sort((a, b) => (a.stock || 0) - (b.stock || 0));
  const totalUnits = list.reduce((s, p) => s + (p.stock || 0), 0);
  const value = list.reduce((s, p) => s + (p.stock || 0) * p.price, 0);
  const reserved = {};
  S.orders.filter(o => o.status === 'pending').forEach(o => o.items.forEach(it => { reserved[it.productId] = (reserved[it.productId] || 0) + it.qty; }));
  return h('div',
    h('div.stats', stat(totalUnits, t('stock') + ' (' + t('units') + ')'), stat(fmtSAR(value), t('inventory') + ' — ' + t('price'))),
    list.length ? h('div.card', list.map(p => {
      const st = p.stock || 0, lowAt = p.lowStock ?? 5, low = st <= lowAt;
      const pct = Math.min(100, Math.round(st / Math.max(lowAt * 4, 1) * 100));
      return h('div.list-item',
        p.image ? h('img.thumb', { src: p.image, alt: '' }) : h('div.thumb'),
        h('div.grow', h('b', nm(p)), h('div.small.muted', (p.sku || '') + (reserved[p.id] ? ' • ⏳ ' + reserved[p.id] + ' ' + t('pendingOrders') : '')),
          h('div.stockbar', h('i' + (low ? '.low' : ''), { style: 'width:' + pct + '%' }))),
        h('div.center', h('div', { style: 'font-weight:700;font-size:18px;color:' + (low ? 'var(--red)' : 'var(--green-d)') }, st),
          h('button.btn.ghost.sm', { onclick: () => adjustStock(p) }, t('adjust'))));
    })) : empty('📋', t('noProducts')));
}
function adjustStock(p) {
  let val = p.stock || 0;
  const v = h('input', { type: 'number', value: val, min: 0, inputmode: 'numeric', style: 'text-align:center;font-size:20px;font-weight:700' });
  v.addEventListener('input', () => { val = Number(v.value); });
  const step = (n) => { val = Math.max(0, Number(v.value || 0) + n); v.value = val; };
  const s = sheet(nm(p), h('div',
    h('div.row.gap', h('button.btn.ghost', { onclick: () => step(-10) }, '−10'), h('button.btn.ghost', { onclick: () => step(-1) }, '−1'),
      h('div.field.grow', { style: 'margin:0' }, v), h('button.btn.ghost', { onclick: () => step(1) }, '+1'), h('button.btn.ghost', { onclick: () => step(10) }, '+10')),
    h('button.btn.block.mt', { onclick: async () => {
      if (!(val >= 0) || !Number.isInteger(val)) { toast(t('required'), 'err'); return; }
      try { await backend.setStock(p.id, val); s.close(); toast(t('stockUpdated'), 'ok'); } catch (e) { toast(errMsg(e), 'err'); }
    } }, t('setStock'))));
}

// ------------------------------------------------------------------ settings
function settings() {
  if (!draft.settings) draft.settings = JSON.parse(JSON.stringify(S.settings));
  const d = draft.settings;
  const bind = (obj, k, a = {}) => {
    const tag = a.tag || 'input'; delete a.tag;
    if (a.type === 'checkbox') { const el = h('input', { type: 'checkbox', checked: !!obj[k] }); el.addEventListener('change', () => { obj[k] = el.checked; }); return el; }
    const el = h(tag, { ...a, value: obj[k] ?? '' });
    el.addEventListener('input', () => { obj[k] = a.type === 'number' ? Number(el.value) : el.value; });
    return el;
  };
  const save = async (btn) => {
    if (d.payment.bank.enabled && d.payment.bank.iban && !/^SA\d{22}$/i.test(d.payment.bank.iban.replace(/\s/g, ''))) {
      toast(getLang() === 'ar' ? 'الآيبان السعودي يبدأ بـ SA ويتكون من 24 خانة' : 'Saudi IBAN must start with SA and have 24 characters', 'err'); return;
    }
    if (d.payment.card.enabled && d.payment.card.moyasarPublishableKey && !/^pk_(live|test)_/.test(d.payment.card.moyasarPublishableKey.trim())) {
      toast(getLang() === 'ar' ? 'استخدم المفتاح العام (pk_) وليس السري' : 'Use the publishable key (pk_), never the secret key', 'err'); return;
    }
    if (btn) btn.disabled = true;
    try { const clean = mergeSettings(d); await backend.saveSettings(clean); draft.settings = null; toast(t('saved'), 'ok'); render(); }
    catch (e) { toast(errMsg(e), 'err'); if (btn) btn.disabled = false; }
  };
  const saveBtn = () => { const b = h('button.btn.block.mt', { onclick: () => save(b) }, t('save')); return b; };
  const pm = d.payment;
  const pmSection = (key, icon, inner) => {
    const body = h('div', { style: pm[key].enabled ? '' : 'display:none' }, inner);
    const cb = h('input', { type: 'checkbox', checked: !!pm[key].enabled });
    cb.addEventListener('change', () => { pm[key].enabled = cb.checked; body.style.display = cb.checked ? '' : 'none'; });
    return h('div.field-row', h('label.check', cb, icon + ' ' + t(key) + ' — ' + t('enabled')), body);
  };

  return h('div',
    h('h2', '⚙️ ' + t('settings')),
    h('div.card', h('h3', '💳 ' + t('paymentSettings')),
      pmSection('cod', '💵', [field(t('noteEn'), bind(pm.cod, 'noteEn', { dir: 'ltr' })), field(t('noteAr'), bind(pm.cod, 'noteAr', { dir: 'rtl' }))]),
      pmSection('bank', '🏦', [
        field(t('bankName'), bind(pm.bank, 'bankName', { placeholder: 'Al Rajhi Bank / مصرف الراجحي' })),
        field(t('accountName'), bind(pm.bank, 'accountName')),
        field(t('iban'), bind(pm.bank, 'iban', { class: 'ltr', placeholder: 'SA00 0000 0000 0000 0000 0000' })),
        h('label.check', bind(pm.bank, 'requireReceipt', { type: 'checkbox' }), t('requireReceipt')),
        field(t('noteEn'), bind(pm.bank, 'noteEn', { tag: 'textarea', dir: 'ltr' })), field(t('noteAr'), bind(pm.bank, 'noteAr', { tag: 'textarea', dir: 'rtl' }))]),
      pmSection('stcpay', '📱', [
        field(t('stcNumber'), bind(pm.stcpay, 'number', { type: 'tel', class: 'ltr', placeholder: '05XXXXXXXX' })),
        field(t('noteEn'), bind(pm.stcpay, 'noteEn', { tag: 'textarea', dir: 'ltr' })), field(t('noteAr'), bind(pm.stcpay, 'noteAr', { tag: 'textarea', dir: 'rtl' }))]),
      pmSection('card', '💳', [
        field(t('moyasarKey'), bind(pm.card, 'moyasarPublishableKey', { class: 'ltr', placeholder: 'pk_live_xxxxxxxx' }), t('moyasarHelp'))]),
      saveBtn()),
    h('div.card', h('h3', '📝 ' + t('formBuilder')), h('p.small.muted', t('formBuilderHelp')),
      h('div', d.checkoutFields.map((cf, i) => h('div.field-row.row.gap',
        h('div.grow', h('b', L(cf, 'label') || '—'), h('div.small.muted', t('ft_' + cf.type) + (cf.required ? ' • ' + t('isRequired') : '') + (cf.type === 'select' ? ' • ' + cf.options : ''))),
        h('button.btn.ghost.sm', { onclick: () => editField(cf, (v) => { d.checkoutFields[i] = v; render(); }) }, t('edit')),
        h('button.btn.danger.ghost.sm', { onclick: () => { d.checkoutFields.splice(i, 1); render(); } }, '✕')))),
      h('button.btn.outline.block', { onclick: () => editField(null, (v) => { d.checkoutFields.push(v); render(); }) }, '+ ' + t('addField')),
      saveBtn()),
    h('div.card', h('h3', '🏪 ' + t('storeSettings')),
      field(t('storeNameEn'), bind(d, 'storeNameEn', { dir: 'ltr' })), field(t('storeNameAr'), bind(d, 'storeNameAr', { dir: 'rtl' })),
      h('div.grid2', field(t('phone'), bind(d, 'phone', { type: 'tel', class: 'ltr' })), field(t('whatsapp'), bind(d, 'whatsapp', { type: 'tel', class: 'ltr', placeholder: '9665XXXXXXXX' }))),
      field(t('addressEn'), bind(d, 'addressEn', { dir: 'ltr' })), field(t('addressAr'), bind(d, 'addressAr', { dir: 'rtl' })),
      h('div.grid2', field(t('vatNumber'), bind(d, 'vatNumber', { class: 'ltr' })), field(t('crNumber'), bind(d, 'crNumber', { class: 'ltr' }))),
      h('div.grid2', field(t('deliveryFee'), bind(d, 'deliveryFee', { type: 'number', min: 0 })), field(t('freeDeliveryOver'), bind(d, 'freeDeliveryOver', { type: 'number', min: 0 }))),
      h('label.check', bind(d, 'pricesIncludeVat', { type: 'checkbox' }), t('vatIncluded') + ' (15%)'),
      saveBtn()),
    h('div.card', h('h3', '🗂️ ' + t('categoriesSettings')),
      d.categories.map((c, i) => h('div.row.gap.mb', h('input.grow', { value: c.en, dir: 'ltr', style: 'min-width:0;border:1.5px solid var(--line);border-radius:10px;padding:9px', oninput: (e) => { c.en = e.target.value; } }),
        h('input.grow', { value: c.ar, dir: 'rtl', style: 'min-width:0;border:1.5px solid var(--line);border-radius:10px;padding:9px', oninput: (e) => { c.ar = e.target.value; } }),
        h('button.btn.danger.ghost.sm', { onclick: () => { d.categories.splice(i, 1); render(); } }, '✕'))),
      h('button.btn.outline.block', { onclick: () => { d.categories.push({ id: 'c' + Date.now().toString(36), en: '', ar: '' }); render(); } }, '+ ' + t('addCategory')),
      saveBtn()),
    h('div.card', h('div.small.muted', t('firebaseStatus') + ': ' + (backend.mode === 'firebase' ? '🟢 ' + t('connected') : '🟡 ' + t('demoMode'))), h('div.small.muted', S.user.email),
      h('button.btn.danger.ghost.block.mt', { onclick: () => backend.auth.signOut() }, t('logout'))));
}

function editField(cf, onSave) {
  const v = cf ? { ...cf } : { id: 'f' + Date.now().toString(36), labelEn: '', labelAr: '', type: 'text', required: false, options: '' };
  const mk = (k, a = {}) => { const el = h(a.tag || 'input', { ...a, tag: null, value: v[k] || '' }); el.addEventListener('input', () => { v[k] = el.value; }); return el; };
  const type = h('select', ['text', 'number', 'textarea', 'select', 'date'].map(k => h('option', { value: k }, t('ft_' + k)))); type.value = v.type;
  const opt = field(t('options'), mk('options', { placeholder: 'Option 1, Option 2' }));
  opt.style.display = v.type === 'select' ? '' : 'none';
  type.addEventListener('change', () => { v.type = type.value; opt.style.display = v.type === 'select' ? '' : 'none'; });
  const rq = h('input', { type: 'checkbox', checked: v.required }); rq.addEventListener('change', () => { v.required = rq.checked; });
  const s = sheet(cf ? t('edit') : t('addField'), h('div',
    field(t('fieldLabelEn'), mk('labelEn', { dir: 'ltr' })), field(t('fieldLabelAr'), mk('labelAr', { dir: 'rtl' })),
    field(t('fieldType'), type), opt, h('label.check', rq, t('isRequired')),
    h('button.btn.block', { onclick: () => { if (!v.labelEn.trim() && !v.labelAr.trim()) { toast(t('required'), 'err'); return; } s.close(); onSave(v); } }, t('save'))));
}

// ------------------------------------------------------------------ start
function boot() {
backend.auth.onChange((u) => {
  unsubs.forEach(f => f && f()); unsubs = []; knownOrders = null;
  S.user = u;
  if (u && isOwnerEmail(u.email)) {
    unsubs.push(backend.watchSettings((s) => { if (s) { S.settings = s; render(true); } }));
    unsubs.push(backend.watchProducts((p) => { if (p) { S.products = p; render(true); } }));
    unsubs.push(backend.watchAllOrders((o, err) => { if (err) { toast(errMsg(err), 'err'); return; } if (o) { alertNew(o); S.orders = o; render(true); } }));
    unsubs.push(backend.watchAllServices((o) => { if (o) { S.services = o; render(true); } }));
  }
  render();
});
onLangChange(() => render());
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
}
boot();
