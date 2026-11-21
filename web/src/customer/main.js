import { t, L, getLang, applyLang, toggleLang, onLangChange } from '../shared/i18n.js';
import { backend, authErrorKey, SS, mergeSettings } from '../shared/backend.js';
import {
  h, fmtSAR, fmtDate, toast, sheet, confirmBox, field, isSaudiMobile, normPhone, isEmail, imagePicker,
  copyText, badge, statusKind, payKind, empty, langButton, demoBanner, waLink, totals, errMsg, dbErrorBox
} from '../shared/ui.js';
import { luhnOk, parseExpiry, startMoyasarPayment, readPaymentReturn } from '../shared/payments.js';

applyLang();

// ------------------------------------------------------------------ state
const S = {
  user: undefined, profile: null, settings: null, products: null,
  orders: [], services: [], cat: 'all', q: '',
  cart: loadCart(),
};
const draft = { checkout: null, repair: null, card: { name: '', number: '', expiry: '', cvc: '' } };
let unsubs = [];

function loadCart() { try { return JSON.parse(localStorage.getItem('janah_cart') || '[]'); } catch (e) { return []; } }
function saveCart() { try { localStorage.setItem('janah_cart', JSON.stringify(S.cart)); } catch (e) {} updateNav(); }
const cartCount = () => S.cart.reduce((s, i) => s + i.qty, 0);
const productById = (id) => (S.products || []).find(p => p.id === id);
const authMsg = (e) => { const m = authErrorKey(e); return m ? m[getLang() === 'ar' ? 1 : 0] : errMsg(e); };

// ------------------------------------------------------------------ boot
const app = document.getElementById('app');
const payReturn = readPaymentReturn();

// (boot code runs at the end of this file, after every view is defined)

async function handlePaymentReturn(r) {
  const paid = r.status === 'paid';
  const order = { id: r.orderId };
  try {
    await backend.updateOrder(order.id, { payment: { method: 'card', status: paid ? 'paid' : 'failed', moyasarId: r.id, message: r.message } });
  } catch (e) { console.error(e); }
  toast(paid ? (getLang() === 'ar' ? 'تم الدفع بنجاح ✅' : 'Payment successful ✅') : (getLang() === 'ar' ? 'فشل الدفع: ' : 'Payment failed: ') + (paid ? '' : r.message), paid ? 'ok' : 'err');
  location.hash = '#/order/' + order.id;
}

// keep cart in sync with live prices / stock
function syncCart() {
  let changed = false;
  S.cart = S.cart.filter(it => {
    const p = productById(it.id);
    if (!p || p.active === false) { changed = true; return false; }
    if (it.qty > (p.stock || 0)) { it.qty = Math.max(0, p.stock || 0); changed = true; }
    return it.qty > 0;
  });
  if (changed) saveCart();
}

// ------------------------------------------------------------------ shell
function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  return { name: parts[0] || 'home', arg: parts[1] };
}
const LIVE = new Set(['home', 'product', 'cart', 'orders', 'order']);

function render(fromData) {
  const r = route();
  if (fromData && !LIVE.has(r.name)) return; // don't wipe forms while typing
  if (S.user === undefined || !S.settings || !S.products) {
    app.replaceChildren(header(), h('div.spinner')); return;
  }
  const y = window.scrollY;
  const views = { home, product, cart, checkout, orders, order, repair, account, login, done };
  const view = (views[r.name] || home)(r.arg);
  app.replaceChildren(header(), demoBanner(backend.mode), h('main', S.dbError ? dbErrorBox(S.dbError) : null, view), nav(r.name));
  if (fromData) window.scrollTo(0, y);
}

function header() {
  const s = S.settings;
  return h('header.topbar',
    h('a.brand', { href: '#/home', style: 'color:#fff;text-decoration:none' },
      h('div.logo', '⚡'),
      h('div', h('h1', s ? L(s, 'storeName') : t('appName')), h('small', t('tagline')))),
    langButton(toggleLang));
}

function nav(active) {
  const items = [['home', '🏠', t('shop')], ['repair', '🔧', t('services')], ['cart', '🛒', t('cart')], ['orders', '📦', t('orders')], ['account', '👤', t('account')]];
  return h('nav.bottomnav', items.map(([k, ic, label]) =>
    h('a' + (active === k || (k === 'orders' && active === 'order') || (k === 'cart' && active === 'checkout') ? '.on' : ''), { href: '#/' + k },
      h('span.ic', ic), label, k === 'cart' && cartCount() ? h('span.dot#cartdot', cartCount()) : null)));
}
function updateNav() {
  const d = document.getElementById('cartdot');
  if (d) d.textContent = cartCount();
  else if (cartCount()) { const n = document.querySelector('.bottomnav'); if (n) n.replaceWith(nav(route().name)); }
}

// ------------------------------------------------------------------ shop
function home() {
  const s = S.settings;
  const list = S.products.filter(p => p.active !== false)
    .filter(p => S.cat === 'all' || p.category === S.cat)
    .filter(p => !S.q || (p.nameEn + ' ' + p.nameAr + ' ' + (p.sku || '')).toLowerCase().includes(S.q.toLowerCase()));
  const grid = h('div.products', list.map(productCard));
  const searchInput = h('input', { type: 'search', placeholder: t('search'), value: S.q });
  searchInput.addEventListener('input', () => {
    S.q = searchInput.value;
    const filtered = S.products.filter(p => p.active !== false).filter(p => S.cat === 'all' || p.category === S.cat)
      .filter(p => !S.q || (p.nameEn + ' ' + p.nameAr + ' ' + (p.sku || '')).toLowerCase().includes(S.q.toLowerCase()));
    grid.replaceChildren(...filtered.map(productCard));
  });
  return h('div',
    h('div.hero', h('h2', t('welcome') + ' 👋'), h('p', s.freeDeliveryOver > 0 ? t('freeOver', { n: fmtSAR(s.freeDeliveryOver) }) : t('tagline')),
      h('a.btn.gold.sm', { href: '#/repair' }, '🔧 ', t('bookRepair'))),
    h('div.search', searchInput),
    h('div.chips', [{ id: 'all', en: t('all'), ar: t('all') }, ...s.categories].map(c =>
      h('button.chip' + (S.cat === c.id ? '.on' : ''), { onclick: () => { S.cat = c.id; render(); } }, getLang() === 'ar' ? c.ar : c.en))),
    list.length ? grid : empty('🔎', t('noProducts')));
}

function productCard(p) {
  const out = (p.stock || 0) <= 0;
  const disc = p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  return h('div.pcard', { onclick: () => { location.hash = '#/product/' + p.id; } },
    h('div.pimg', p.image ? h('img', { src: p.image, alt: L(p, 'name'), loading: 'lazy' }) : null,
      out ? h('span.tag.soldout', t('outOfStock')) : disc ? h('span.tag', '-' + disc + '%') : null),
    h('div.pbody',
      h('div.pname', L(p, 'name')),
      h('div', h('span.price', fmtSAR(p.price)), disc ? h('span.old', fmtSAR(p.oldPrice)) : null),
      h('button.btn.sm.block' + (out ? '.ghost' : ''), { disabled: out, onclick: (e) => { e.stopPropagation(); addToCart(p, 1); } }, out ? t('outOfStock') : '+ ' + t('addToCart'))));
}

function addToCart(p, n) {
  const it = S.cart.find(x => x.id === p.id);
  const cur = it ? it.qty : 0;
  if (cur + n > (p.stock || 0)) { toast(t('onlyLeft', { n: p.stock || 0 }), 'err'); return; }
  if (it) it.qty += n; else S.cart.push({ id: p.id, qty: n });
  saveCart(); toast('✓ ' + t('added'), 'ok');
}

function product(id) {
  const p = productById(id);
  if (!p) return empty('❓', t('noProducts'), h('a.btn', { href: '#/home' }, t('continueShopping')));
  const out = (p.stock || 0) <= 0;
  let q = 1;
  const qv = h('span', '1');
  const cat = S.settings.categories.find(c => c.id === p.category);
  return h('div',
    h('button.link-btn', { onclick: () => history.back() }, getLang() === 'ar' ? '→ ' : '← ', t('back')),
    h('div.pdetail-img', p.image ? h('img', { src: p.image, alt: '' }) : null),
    h('div.card',
      cat ? h('div.small.muted', getLang() === 'ar' ? cat.ar : cat.en) : null,
      h('h2', { style: 'margin:2px 0 6px' }, L(p, 'name')),
      h('div.row.between',
        h('div', h('span.price', { style: 'font-size:22px' }, fmtSAR(p.price)), p.oldPrice > p.price ? h('span.old', fmtSAR(p.oldPrice)) : null,
          h('div.small.muted', t('vatIncluded'))),
        out ? badge(t('outOfStock'), 'bad') : (p.stock <= (p.lowStock || 5) ? badge(t('onlyLeft', { n: p.stock }), 'warn') : badge(t('inStock'), 'ok'))),
      L(p, 'desc') ? h('p', { style: 'white-space:pre-line' }, L(p, 'desc')) : null,
      p.sku ? h('div.small.muted', t('sku') + ': ' + p.sku) : null,
      out ? null : h('div.row.gap.mt',
        h('div.qty', h('button', { onclick: () => { q = Math.max(1, q - 1); qv.textContent = q; } }, '−'), qv,
          h('button', { onclick: () => { q = Math.min(p.stock, q + 1); qv.textContent = q; } }, '+')),
        h('button.btn.grow', { onclick: () => addToCart(p, q) }, '🛒 ', t('addToCart')))));
}

// ------------------------------------------------------------------ cart
function cart() {
  if (!S.cart.length) return empty('🛒', t('emptyCart'), h('a.btn', { href: '#/home' }, t('continueShopping')));
  const items = S.cart.map(it => ({ ...it, p: productById(it.id) })).filter(x => x.p);
  const tt = totals(items.map(x => ({ price: x.p.price, qty: x.qty })), S.settings);
  return h('div',
    h('h2', t('cart')),
    h('div.card', items.map(x => h('div.list-item',
      x.p.image ? h('img.thumb', { src: x.p.image, alt: '' }) : h('div.thumb'),
      h('div.grow', h('div', { style: 'font-weight:700' }, L(x.p, 'name')), h('div.price', fmtSAR(x.p.price)),
        h('div.row.gap.mt', { style: 'margin-top:6px' },
          h('div.qty', h('button', { onclick: () => setQty(x.id, x.qty - 1) }, '−'), h('span', x.qty), h('button', { onclick: () => setQty(x.id, x.qty + 1) }, '+')),
          h('button.link-btn', { style: 'color:var(--red)', onclick: () => setQty(x.id, 0) }, t('remove'))))))),
    summary(tt),
    h('a.btn.block.mt', { href: '#/checkout' }, t('checkout') + ' • ' + fmtSAR(tt.total)));
}
function setQty(id, q) {
  const p = productById(id);
  if (p && q > (p.stock || 0)) { toast(t('onlyLeft', { n: p.stock || 0 }), 'err'); return; }
  if (q <= 0) S.cart = S.cart.filter(x => x.id !== id); else S.cart.find(x => x.id === id).qty = q;
  saveCart(); render();
}
function summary(tt) {
  const s = S.settings;
  return h('div.card',
    h('div.sumrow', h('span', t('subtotal')), h('span', fmtSAR(tt.subtotal))),
    h('div.sumrow', h('span', t('delivery')), h('span', tt.deliveryFee ? fmtSAR(tt.deliveryFee) : t('free'))),
    h('div.sumrow.muted.small', h('span', t('vat') + (s.pricesIncludeVat ? ' — ' + t('vatIncluded') : '')), h('span', fmtSAR(tt.vat))),
    h('div.sumrow.total', h('span', t('total')), h('span', fmtSAR(tt.total))),
    s.freeDeliveryOver > 0 && tt.deliveryFee ? h('div.small.muted', t('freeOver', { n: fmtSAR(s.freeDeliveryOver) })) : null);
}

// ------------------------------------------------------------------ checkout
function lbl(text, req) { return h('span', text, req ? h('span.req', ' *') : null); }

function checkout() {
  if (!S.cart.length) { location.hash = '#/cart'; return h('div'); }
  if (!S.user) { SS.setItem('janah_after_login', '#/checkout'); return loginView(t('signInToOrder')); }
  const s = S.settings, pr = S.profile || {};
  const methods = ['cod', 'bank', 'stcpay', 'card'].filter(m => s.payment[m] && s.payment[m].enabled && (m !== 'card' || s.payment.card.moyasarPublishableKey));
  if (!draft.checkout) draft.checkout = {
    name: pr.name || S.user.name || '', phone: pr.phone || '', email: S.user.email || '', city: pr.city || '', district: pr.district || '',
    address: pr.address || '', notes: '', extra: {}, method: methods[0] || 'cod', reference: '', receipt: '',
  };
  const d = draft.checkout;
  if (!methods.includes(d.method)) d.method = methods[0];
  const errs = {};
  const bind = (key, attrs = {}, obj = d) => {
    const tag = attrs.tag || 'input'; delete attrs.tag;
    const el = h(tag, { ...attrs, value: obj[key] || '' });
    const clr = () => { const w = el.closest('.field'); if (w) { w.classList.remove('invalid'); w.querySelector('.err')?.remove(); } };
    el.addEventListener('input', () => { obj[key] = el.value; clr(); });
    el.addEventListener('change', () => { obj[key] = el.value; clr(); });
    return el;
  };
  const f = (key, label, inputEl, req) => { const w = field(lbl(label, req), inputEl); w.dataset.key = key; return w; };

  const items = S.cart.map(it => ({ ...it, p: productById(it.id) })).filter(x => x.p);
  const tt = totals(items.map(x => ({ price: x.p.price, qty: x.qty })), s);

  const extraFields = (s.checkoutFields || []).map(cf => {
    let el;
    if (cf.type === 'select') el = bind(cf.id, { tag: 'select' }, d.extra), el.prepend(h('option', { value: '' }, '—')),
      String(cf.options || '').split(',').map(o => o.trim()).filter(Boolean).forEach(o => el.appendChild(h('option', { value: o }, o))), el.value = d.extra[cf.id] || '';
    else if (cf.type === 'textarea') el = bind(cf.id, { tag: 'textarea' }, d.extra);
    else el = bind(cf.id, { type: cf.type === 'number' ? 'number' : cf.type === 'date' ? 'date' : 'text' }, d.extra);
    return f('x_' + cf.id, L(cf, 'label'), el, cf.required);
  });

  const payBox = h('div');
  const drawPay = () => payBox.replaceChildren(...methods.map(m => payMethod(m, d, bind, f, tt)));
  const pickMethod = (m) => { d.method = m; drawPay(); };
  draft._pick = pickMethod;
  drawPay();

  const btn = h('button.btn.block.gold', { onclick: () => submit() }, d.method === 'card' ? t('payNow', { n: fmtSAR(tt.total) }) : t('placeOrder') + ' • ' + fmtSAR(tt.total));
  draft._btn = btn; draft._tt = tt;

  const form = h('div',
    h('h2', t('checkoutTitle')),
    h('div.card', h('h3', t('yourDetails')),
      f('name', t('fullName'), bind('name', { autocomplete: 'name' }), true),
      h('div.grid2', f('phone', t('phone'), bind('phone', { type: 'tel', inputmode: 'tel', placeholder: '05XXXXXXXX', class: 'ltr' }), true),
        f('city', t('city'), bind('city', { autocomplete: 'address-level2' }), true)),
      f('district', t('district'), bind('district')),
      f('address', t('address'), bind('address', { autocomplete: 'street-address' }), true),
      extraFields,
      f('notes', t('notes'), bind('notes', { tag: 'textarea' }))),
    h('div.card', h('h3', t('paymentMethod')), methods.length ? payBox : h('div.errbox', t('errGeneric'))),
    summary(tt),
    h('div.mt', btn));

  async function submit() {
    // validate
    form.querySelectorAll('.field').forEach(x => { x.classList.remove('invalid'); x.querySelector('.err')?.remove(); });
    const bad = (key, msg) => { errs[key] = msg; };
    for (const k in errs) delete errs[k];
    if (!d.name.trim()) bad('name', t('required'));
    if (!isSaudiMobile(d.phone)) bad('phone', t('invalidPhone'));
    if (!d.city.trim()) bad('city', t('required'));
    if (!d.address.trim()) bad('address', t('required'));
    (s.checkoutFields || []).forEach(cf => { if (cf.required && !String(d.extra[cf.id] || '').trim()) bad('x_' + cf.id, t('required')); });
    if (d.method === 'bank') {
      if (!d.reference.trim() && !d.receipt) bad('reference', t('required'));
      if (s.payment.bank.requireReceipt && !d.receipt) bad('receipt', t('required'));
    }
    if (d.method === 'stcpay' && !d.reference.trim()) bad('reference', t('required'));
    if (d.method === 'card') {
      const c = draft.card;
      if (!c.name.trim()) bad('c_name', t('required'));
      if (!luhnOk(c.number)) bad('c_number', getLang() === 'ar' ? 'رقم البطاقة غير صحيح' : 'Invalid card number');
      if (!parseExpiry(c.expiry)) bad('c_expiry', getLang() === 'ar' ? 'تاريخ غير صحيح' : 'Invalid date');
      if (!/^\d{3,4}$/.test(c.cvc.trim())) bad('c_cvc', t('required'));
    }
    const keys = Object.keys(errs);
    if (keys.length) {
      keys.forEach(k => { const w = form.querySelector(`.field[data-key="${k}"]`); if (w) { w.classList.add('invalid'); w.appendChild(h('span.err', errs[k])); } });
      const first = form.querySelector('.field.invalid'); first && first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast(errs[keys[0]], 'err'); return;
    }
    // re-check stock
    for (const x of items) if (x.qty > (productById(x.id)?.stock || 0)) { toast(t('onlyLeft', { n: productById(x.id)?.stock || 0 }) + ' — ' + L(x.p, 'name'), 'err'); return; }

    btn.disabled = true; btn.textContent = t('placing');
    try {
      const phone = normPhone(d.phone);
      const order = await backend.createOrder({
        uid: S.user.uid,
        customer: { name: d.name.trim(), phone, email: d.email, city: d.city.trim(), district: d.district.trim(), address: d.address.trim() },
        extra: (s.checkoutFields || []).filter(cf => d.extra[cf.id]).map(cf => ({ id: cf.id, labelEn: cf.labelEn, labelAr: cf.labelAr, value: d.extra[cf.id] })),
        notes: d.notes.trim(),
        items: items.map(x => ({ productId: x.id, nameEn: x.p.nameEn || '', nameAr: x.p.nameAr || '', sku: x.p.sku || '', price: Number(x.p.price), qty: x.qty })),
        subtotal: tt.subtotal, deliveryFee: tt.deliveryFee, vat: tt.vat, total: tt.total, lang: getLang(),
        payment: {
          method: d.method,
          status: d.method === 'bank' || d.method === 'stcpay' ? 'submitted' : 'pending',
          reference: d.method === 'bank' || d.method === 'stcpay' ? d.reference.trim() : '',
          receipt: d.method === 'bank' ? d.receipt : '',
        },
      });
      // remember details for next time
      const prof = { name: d.name.trim(), phone, city: d.city.trim(), district: d.district.trim(), address: d.address.trim() };
      S.profile = { ...(S.profile || {}), ...prof }; draft.repair = null;
      backend.saveProfile(S.user.uid, prof).catch(() => {});
      S.cart = []; saveCart(); draft.checkout = null;
      if (d.method === 'card') {
        try { await startMoyasarPayment({ publishableKey: s.payment.card.moyasarPublishableKey, amountSAR: order.total, orderId: order.id, orderNo: order.orderNo, card: draft.card }); }
        catch (e) {
          await backend.updateOrder(order.id, { payment: { method: 'card', status: 'failed', message: e.message } }).catch(() => {});
          toast((e.gateway ? e.message : errMsg(e)), 'err'); location.hash = '#/order/' + order.id;
        }
        draft.card = { name: '', number: '', expiry: '', cvc: '' };
        return;
      }
      SS.setItem('janah_last_order', JSON.stringify({ id: order.id, orderNo: order.orderNo }));
      location.hash = '#/done';
    } catch (e) {
      console.error(e); toast(errMsg(e), 'err'); btn.disabled = false; btn.textContent = t('placeOrder');
    }
  }
  return form;
}

function payMethod(m, d, bind, f, tt) {
  const s = S.settings.payment;
  const icons = { cod: '💵', bank: '🏦', stcpay: '📱', card: '💳' };
  const on = d.method === m;
  const el = h('div.paymethod' + (on ? '.on' : ''), { onclick: (e) => { if (!on && !e.target.closest('.detail')) { draft._pick(m); updateBtn(); } } },
    h('div.head', h('input', { type: 'radio', name: 'pm', checked: on }), h('span.pm-ico', icons[m]), h('span.grow', t(m)),
      m === 'card' ? h('span.small.muted', 'mada • VISA • MC') : null));
  if (!on) return el;
  const det = h('div.detail');
  const conf = s[m];
  if (L(conf, 'note')) det.appendChild(h('div.small.muted', L(conf, 'note')));
  if (m === 'bank') {
    det.appendChild(h('div.paybox',
      conf.bankName ? kv(t('bankName'), conf.bankName) : null,
      conf.accountName ? kv(t('accountName'), conf.accountName) : null,
      conf.iban ? kv(t('iban'), conf.iban, true) : null,
      kv(t('total'), fmtSAR(tt.total))));
    det.appendChild(f('reference', t('transferRef'), bind('reference', { class: 'ltr' })));
    const rw = field(lbl(t('uploadReceipt'), conf.requireReceipt), imagePicker(d.receipt, (url) => { d.receipt = url; rw.classList.remove('invalid'); rw.querySelector('.err')?.remove(); }, { maxDim: 1200, label: d.receipt ? t('changePhoto') : t('pickImage') }));
    rw.dataset.key = 'receipt'; det.appendChild(rw);
  }
  if (m === 'stcpay') {
    det.appendChild(h('div.paybox', conf.number ? kv(t('stcNumber'), conf.number, true) : null, kv(t('total'), fmtSAR(tt.total))));
    det.appendChild(f('reference', t('transferRef'), bind('reference', { class: 'ltr' }), true));
  }
  if (m === 'card') {
    const c = draft.card;
    det.append(
      f('c_name', t('cardName'), bind('name', { autocomplete: 'cc-name', class: 'ltr' }, c), true),
      f('c_number', t('cardNumber'), bind('number', { inputmode: 'numeric', autocomplete: 'cc-number', placeholder: '•••• •••• •••• ••••', class: 'ltr', maxlength: 23 }, c), true),
      h('div.grid2', f('c_expiry', t('expiry'), bind('expiry', { inputmode: 'numeric', placeholder: 'MM/YY', class: 'ltr', maxlength: 7, autocomplete: 'cc-exp' }, c), true),
        f('c_cvc', t('cvc'), bind('cvc', { inputmode: 'numeric', type: 'password', maxlength: 4, class: 'ltr', autocomplete: 'cc-csc' }, c), true)),
      h('div.small.muted', '🔒 ', t('securePay')));
  }
  if (m === 'cod') {} // note only
  el.appendChild(det);
  return el;
}
function updateBtn() {
  const b = draft._btn, d = draft.checkout; if (!b || !d) return;
  b.textContent = d.method === 'card' ? t('payNow', { n: fmtSAR(draft._tt.total) }) : t('placeOrder') + ' • ' + fmtSAR(draft._tt.total);
}
function kv(k, v, copyable) {
  return h('div.kv', h('span.muted', k), h('span.row.gap', h('b', v), copyable ? h('button.btn.ghost.sm', { type: 'button', onclick: (e) => { e.stopPropagation(); copyText(v); } }, t('copy')) : null));
}

function done() {
  let o = null; try { o = JSON.parse(SS.getItem('janah_last_order') || 'null'); } catch (e) {}
  return h('div.center', { style: 'padding-top:30px' },
    h('div', { style: 'font-size:64px' }, '✅'), h('h2', t('orderPlaced')),
    o ? h('p', t('orderNo') + ': ', h('b', { style: 'direction:ltr;unicode-bidi:plaintext' }, o.orderNo)) : null,
    h('p.muted', t('thankYou')),
    h('a.btn', { href: o ? '#/order/' + o.id : '#/orders' }, t('viewOrders')), h('br'),
    h('a.link-btn', { href: '#/home' }, t('continueShopping')));
}

// ------------------------------------------------------------------ orders
const FLOW = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
function orders() {
  if (!S.user) return loginView(t('signInToOrder'));
  if (!S.orders.length) return empty('📦', t('noOrders'), h('a.btn', { href: '#/home' }, t('continueShopping')));
  return h('div', h('h2', t('myOrders')), S.orders.map(o => h('a.card', { href: '#/order/' + o.id, style: 'display:block;text-decoration:none;color:inherit' },
    h('div.row.between', h('b', { style: 'direction:ltr;unicode-bidi:plaintext' }, o.orderNo), badge(t('st_' + o.status), statusKind[o.status])),
    h('div.row.between.small.muted', h('span', fmtDate(o.createdAt) + ' • ' + o.items.reduce((s, i) => s + i.qty, 0) + ' ' + t('items')), h('b.price', fmtSAR(o.total))),
    o.status !== 'cancelled' ? progress(o.status) : null)));
}
function progress(st) { const i = FLOW.indexOf(st); return h('div.progress', FLOW.map((_, k) => h('span' + (k <= i ? '.on' : '')))); }

function order(id) {
  const o = S.orders.find(x => x.id === id);
  if (!S.user) return loginView(t('signInToOrder'));
  if (!o) return h('div.spinner');
  const s = S.settings, pay = o.payment || {};
  const needsCard = pay.method === 'card' && pay.status !== 'paid' && o.status !== 'cancelled' && s.payment.card.moyasarPublishableKey;
  return h('div',
    h('button.link-btn', { onclick: () => { location.hash = '#/orders'; } }, getLang() === 'ar' ? '→ ' : '← ', t('myOrders')),
    h('div.card',
      h('div.row.between', h('h3', { style: 'margin:0;direction:ltr;unicode-bidi:plaintext' }, o.orderNo), badge(t('st_' + o.status), statusKind[o.status])),
      h('div.small.muted', fmtDate(o.createdAt)),
      o.status !== 'cancelled' ? progress(o.status) : null,
      h('div.row.wrap.gap.small', FLOW.map(st => h('span', { style: FLOW.indexOf(st) <= FLOW.indexOf(o.status) && o.status !== 'cancelled' ? 'color:var(--green-d);font-weight:700' : 'color:var(--muted)' }, t('st_' + st)))),
    ),
    h('div.card', h('h3', t('items')), o.items.map(it => h('div.sumrow', h('span', (getLang() === 'ar' ? it.nameAr || it.nameEn : it.nameEn || it.nameAr) + ' × ' + it.qty), h('span', fmtSAR(it.price * it.qty))))),
    summary({ subtotal: o.subtotal, deliveryFee: o.deliveryFee, vat: o.vat, total: o.total }),
    h('div.card', h('h3', t('payment')),
      h('div.row.between', h('span', t(pay.method || 'cod')), badge(t('ps_' + (pay.status || 'pending')), payKind[pay.status || 'pending'])),
      pay.reference ? h('div.small.muted', t('reference') + ': ' + pay.reference) : null,
      pay.status === 'failed' && pay.message ? h('div.errbox', pay.message) : null,
      needsCard ? retryCard(o) : null),
    h('div.card', h('h3', t('customer')), h('div', o.customer.name + ' • ', h('span', { style: 'direction:ltr;unicode-bidi:plaintext' }, o.customer.phone)),
      h('div.small.muted', [o.customer.address, o.customer.district, o.customer.city].filter(Boolean).join('، ')),
      (o.extra || []).map(x => h('div.small', L(x, 'label') + ': ' + x.value))),
    h('div.card', h('h3', t('status')), h('ul.timeline', (o.history || []).slice().reverse().map(x => h('li', h('b', t('st_' + x.status)), ' — ', h('span.muted', fmtDate(x.at)))))),
    h('div.row.gap.mt',
      s.whatsapp ? h('a.btn.ghost.grow', { href: waLink(s.whatsapp, (getLang() === 'ar' ? 'استفسار عن الطلب ' : 'Question about order ') + o.orderNo) }, '💬 ', t('whatsapp')) : null,
      o.status === 'pending' ? h('button.btn.danger.ghost.grow', { onclick: async () => {
        if (!(await confirmBox(t('confirmCancel')))) return;
        try { await backend.customerCancel(o); toast(t('st_cancelled')); } catch (e) { toast(errMsg(e), 'err'); }
      } }, t('cancelOrder')) : null));
}

function retryCard(o) {
  const c = draft.card;
  const mk = (key, attrs) => { const el = h('input', { ...attrs, value: c[key] || '', class: 'ltr' }); el.addEventListener('input', () => { c[key] = el.value; }); return el; };
  const btn = h('button.btn.gold.block', { onclick: async () => {
    if (!c.name.trim() || !luhnOk(c.number) || !parseExpiry(c.expiry) || !/^\d{3,4}$/.test(c.cvc)) { toast(getLang() === 'ar' ? 'تحقق من بيانات البطاقة' : 'Check card details', 'err'); return; }
    btn.disabled = true;
    try { await startMoyasarPayment({ publishableKey: S.settings.payment.card.moyasarPublishableKey, amountSAR: o.total, orderId: o.id, orderNo: o.orderNo, card: c }); }
    catch (e) { toast(e.gateway ? e.message : errMsg(e), 'err'); btn.disabled = false; }
  } }, t('payNow', { n: fmtSAR(o.total) }));
  return h('div.mt',
    field(t('cardName'), mk('name', { autocomplete: 'cc-name' })),
    field(t('cardNumber'), mk('number', { inputmode: 'numeric', autocomplete: 'cc-number', maxlength: 23 })),
    h('div.grid2', field(t('expiry'), mk('expiry', { placeholder: 'MM/YY', maxlength: 7 })), field(t('cvc'), mk('cvc', { type: 'password', inputmode: 'numeric', maxlength: 4 }))),
    btn, h('div.small.muted.mt', '🔒 ', t('securePay')));
}

// ------------------------------------------------------------------ repair
function repair() {
  const pr = S.profile || {};
  if (!draft.repair) draft.repair = { deviceType: 'ac', problem: '', address: pr.address ? [pr.address, pr.district, pr.city].filter(Boolean).join(', ') : '', date: '', name: pr.name || '', phone: pr.phone || '' };
  const d = draft.repair;
  const bind = (key, attrs = {}) => { const tag = attrs.tag || 'input'; delete attrs.tag; const el = h(tag, { ...attrs, value: d[key] || '' }); el.addEventListener('input', () => { d[key] = el.value; }); el.addEventListener('change', () => { d[key] = el.value; }); return el; };
  const devSel = bind('deviceType', { tag: 'select' });
  ['ac', 'washer', 'fridge', 'wiring', 'heater', 'other'].forEach(k => devSel.appendChild(h('option', { value: k }, t('dev_' + k))));
  devSel.value = d.deviceType;
  const btn = h('button.btn.block', { onclick: async () => {
    if (!S.user) { SS.setItem('janah_after_login', '#/repair'); location.hash = '#/login'; return; }
    if (!d.name.trim() || !isSaudiMobile(d.phone) || !d.problem.trim() || !d.address.trim()) { toast(!isSaudiMobile(d.phone) ? t('invalidPhone') : t('required'), 'err'); return; }
    btn.disabled = true;
    try {
      await backend.createService({ uid: S.user.uid, name: d.name.trim(), phone: normPhone(d.phone), deviceType: d.deviceType, problem: d.problem.trim(), address: d.address.trim(), preferredDate: d.date });
      draft.repair = null; toast(t('requestSent'), 'ok'); render();
    } catch (e) { toast(errMsg(e), 'err'); btn.disabled = false; }
  } }, t('submit'));
  return h('div',
    h('div.hero', h('h2', '🔧 ' + t('bookRepair')), h('p', t('repairIntro'))),
    h('div.card',
      field(lbl(t('deviceType'), true), devSel),
      field(lbl(t('problem'), true), bind('problem', { tag: 'textarea' })),
      h('div.grid2', field(lbl(t('fullName'), true), bind('name')), field(lbl(t('phone'), true), bind('phone', { type: 'tel', class: 'ltr', placeholder: '05XXXXXXXX' }))),
      field(lbl(t('address'), true), bind('address')),
      field(t('preferredDate'), bind('date', { type: 'date', min: new Date().toISOString().slice(0, 10) })),
      btn),
    S.user && S.services.length ? h('div.mt', h('h3', t('myRequests')), S.services.map(sv => h('div.card',
      h('div.row.between', h('b', t('dev_' + sv.deviceType)), badge(t('sv_' + sv.status), { new: 'warn', scheduled: 'info', in_progress: 'info', done: 'ok', cancelled: 'bad' }[sv.status])),
      h('div.small', sv.problem), h('div.small.muted', fmtDate(sv.createdAt) + (sv.preferredDate ? ' • ' + sv.preferredDate : '')),
      sv.ownerNote ? h('div.okbox', sv.ownerNote) : null))) : null);
}

// ------------------------------------------------------------------ account / auth
function account() {
  if (!S.user) return loginView();
  const s = S.settings, pr = S.profile || {};
  const p = { name: pr.name || S.user.name || '', phone: pr.phone || '', city: pr.city || '', district: pr.district || '', address: pr.address || '' };
  const mk = (k, a = {}) => { const el = h('input', { ...a, value: p[k] }); el.addEventListener('input', () => { p[k] = el.value; }); return el; };
  return h('div',
    h('div.card.row.gap', h('div.logo', { style: 'width:48px;height:48px;border-radius:50%;background:var(--green-l);display:grid;place-items:center;font-size:24px' }, '👤'),
      h('div.grow', h('b', p.name || t('welcome')), h('div.small.muted', S.user.email))),
    h('div.card', h('h3', t('profile')),
      field(t('fullName'), mk('name')), field(t('phone'), mk('phone', { type: 'tel', class: 'ltr' })),
      h('div.grid2', field(t('city'), mk('city')), field(t('district'), mk('district'))), field(t('address'), mk('address')),
      h('button.btn.block', { onclick: async () => {
        if (p.phone && !isSaudiMobile(p.phone)) { toast(t('invalidPhone'), 'err'); return; }
        try { await backend.saveProfile(S.user.uid, { ...p, phone: normPhone(p.phone) }); S.profile = { ...pr, ...p }; toast(t('saved'), 'ok'); } catch (e) { toast(errMsg(e), 'err'); }
      } }, t('save'))),
    h('div.card', h('h3', t('language')), h('div.seg', h('button' + (getLang() === 'ar' ? '.on' : ''), { onclick: () => toggleLang() }, 'العربية'), h('button' + (getLang() === 'en' ? '.on' : ''), { onclick: () => toggleLang() }, 'English'))),
    (s.phone || s.whatsapp) ? h('div.card', h('h3', t('contactUs')), h('div.small.muted.mb', L(s, 'address')),
      h('div.row.gap', s.whatsapp ? h('a.btn.ghost.grow', { href: waLink(s.whatsapp) }, '💬 ', t('whatsapp')) : null, s.phone ? h('a.btn.ghost.grow', { href: 'tel:' + s.phone }, '📞 ', t('call')) : null)) : null,
    h('button.btn.danger.ghost.block.mt', { onclick: () => backend.auth.signOut() }, t('logout')));
}

function login() { return S.user ? (location.hash = SS.getItem('janah_after_login') || '#/account', h('div')) : loginView(); }

let authMode = 'login';
function loginView(note) {
  const v = { name: '', phone: '', email: '', password: '' };
  const mk = (k, a = {}) => { const el = h('input', { ...a, value: v[k] }); el.addEventListener('input', () => { v[k] = el.value; }); return el; };
  const errBox = h('div');
  const btn = h('button.btn.block', { onclick: go }, authMode === 'login' ? t('login') : t('register'));
  async function go() {
    errBox.replaceChildren();
    if (!isEmail(v.email)) { errBox.appendChild(h('div.errbox', t('invalidEmail'))); return; }
    if (authMode === 'register' && (!v.name.trim() || !isSaudiMobile(v.phone))) { errBox.appendChild(h('div.errbox', !v.name.trim() ? t('fullName') + ': ' + t('required') : t('invalidPhone'))); return; }
    btn.disabled = true;
    try {
      if (authMode === 'login') await backend.auth.signIn(v.email, v.password);
      else await backend.auth.signUp({ name: v.name.trim(), phone: normPhone(v.phone), email: v.email, password: v.password });
      const next = SS.getItem('janah_after_login'); SS.removeItem('janah_after_login');
      if (next) location.hash = next; else render();
    } catch (e) { errBox.appendChild(h('div.errbox', authMsg(e))); btn.disabled = false; }
  }
  const pw = mk('password', { type: 'password', autocomplete: authMode === 'login' ? 'current-password' : 'new-password' });
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return h('div.auth-wrap',
    h('div.auth-logo', '⚡'),
    h('h2.center', authMode === 'login' ? t('login') : t('register')),
    note ? h('p.center.muted', note) : null,
    h('div.card',
      h('div.seg', h('button' + (authMode === 'login' ? '.on' : ''), { onclick: () => { authMode = 'login'; render(); } }, t('login')),
        h('button' + (authMode === 'register' ? '.on' : ''), { onclick: () => { authMode = 'register'; render(); } }, t('register'))),
      authMode === 'register' ? [field(t('fullName'), mk('name', { autocomplete: 'name' })), field(t('phone'), mk('phone', { type: 'tel', class: 'ltr', placeholder: '05XXXXXXXX' }))] : null,
      field(t('email'), mk('email', { type: 'email', autocomplete: 'email', class: 'ltr' })),
      field(t('password'), pw),
      errBox, btn,
      authMode === 'login' ? h('div.center.mt', h('button.link-btn', { onclick: async () => {
        if (!isEmail(v.email)) { toast(t('invalidEmail'), 'err'); return; }
        try { await backend.auth.reset(v.email); toast(t('resetSent'), 'ok'); } catch (e) { toast(authMsg(e), 'err'); }
      } }, t('forgot'))) : null));
}

// ------------------------------------------------------------------ start
function boot() {
const fail = (e) => { console.error(e); S.dbError = e; if (!S.settings) S.settings = mergeSettings(null); if (!S.products) S.products = []; render(); };
backend.watchSettings((s, e) => { if (e) return fail(e); if (s) { S.settings = s; render(true); } });
backend.watchProducts((p, e) => { if (e) return fail(e); if (p) { S.products = p; S.dbError = null; syncCart(); render(true); } });
setTimeout(() => { if (!S.settings || !S.products) fail({ code: 'timeout: no response from database' }); }, 20000);
setTimeout(() => { if (backend.isConnected() !== true && !S.dbError) { S.dbError = { code: 'offline: database not reachable (Firestore not created / no internet)' }; render(); } }, 12000);
backend.onConnection((ok) => { if (ok && S.dbError) { S.dbError = null; render(); } });
backend.auth.onChange(async (u) => {
  unsubs.forEach(f => f && f()); unsubs = [];
  S.user = u; S.orders = []; S.services = [];
  if (u) {
    try { S.profile = await backend.getProfile(u.uid); } catch (e) { S.profile = null; }
    unsubs.push(backend.watchMyOrders(u.uid, (o, e) => { if (e) { toast(errMsg(e), 'err'); return; } if (o) { S.orders = o; render(true); } }));
    unsubs.push(backend.watchMyServices(u.uid, (o, e) => { if (e) return; if (o) { S.services = o; render(true); } }));
    if (payReturn && payReturn.orderId && !payReturn.handled) { payReturn.handled = true; handlePaymentReturn(payReturn); }
  } else S.profile = null;
  render();
});
onLangChange(() => render());
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
}
boot();
