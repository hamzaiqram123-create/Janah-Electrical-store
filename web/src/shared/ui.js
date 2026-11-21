import { t, getLang } from './i18n.js';

/** Tiny DOM builder: h('div.card#x', {onclick}, children...) */
export function h(tag, attrs, ...kids) {
  const m = tag.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) m[2].replace(/([.#])([\w-]+)/g, (_, s, n) => { if (s === '.') el.classList.add(n); else el.id = n; });
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') continue; // applied after children (needed for <select>/<textarea>)
    else if (k in el && k !== 'list' && k !== 'type' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  if (attrs && attrs.value != null) el.value = attrs.value;
  return el;
}

export function fmtSAR(n) {
  const v = Number(n || 0);
  const num = v.toLocaleString(getLang() === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return getLang() === 'ar' ? num + ' ر.س' : 'SAR ' + num;
}

export function fmtDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString(getLang() === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

let toastTimer;
export function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div#toast'); document.body.appendChild(el); }
  el.className = 'show ' + kind;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2600);
}

/** Bottom sheet modal. Returns {close}. */
export function sheet(title, body, { onClose } = {}) {
  const wrap = h('div.sheet-wrap');
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); onClose && onClose(); window.removeEventListener('hashchange', close); };
  const panel = h('div.sheet', h('div.sheet-head', h('h3', title), h('button.icon-btn', { onclick: close, 'aria-label': t('close') }, '✕')), h('div.sheet-body', body));
  wrap.appendChild(panel);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  window.addEventListener('hashchange', close);
  return { close, el: panel };
}

export function confirmBox(message) {
  return new Promise((res) => {
    let s;
    const done = (v) => { s.close(); res(v); };
    s = sheet(message, h('div.row.gap', h('button.btn.ghost.grow', { onclick: () => done(false) }, t('no')), h('button.btn.danger.grow', { onclick: () => done(true) }, t('yes'))));
  });
}

export function field(label, input, hint) {
  return h('label.field', h('span.lbl', label), input, hint ? h('small.hint', hint) : null);
}

export function input(attrs) { return h('input', attrs); }

export function isSaudiMobile(v) {
  const d = String(v || '').replace(/[\s-]/g, '').replace(/^\+?966/, '0').replace(/^5/, '05');
  return /^05\d{8}$/.test(d);
}
export function normPhone(v) {
  return String(v || '').replace(/[\s-]/g, '').replace(/^\+?966/, '0').replace(/^5/, '05');
}
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

/** Read an image file, resize and return a JPEG data URL (keeps Firestore docs small). */
export function compressImage(file, maxDim = 800, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width: w, height: hh } = img;
        const s = Math.min(1, maxDim / Math.max(w, hh));
        w = Math.round(w * s); hh = Math.round(hh * s);
        const c = document.createElement('canvas'); c.width = w; c.height = hh;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh); ctx.drawImage(img, 0, 0, w, hh);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

export function imagePicker(current, onPick, { maxDim = 800, label } = {}) {
  const preview = h('div.img-preview', current ? h('img', { src: current, alt: '' }) : h('span', '📷'));
  const inp = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try {
      const url = await compressImage(f, maxDim);
      preview.innerHTML = ''; preview.appendChild(h('img', { src: url, alt: '' }));
      onPick(url);
    } catch (e) { toast(t('errGeneric'), 'err'); }
  });
  return h('div.img-pick', preview, h('button.btn.ghost.sm', { type: 'button', onclick: () => inp.click() }, label || t('pickImage')), inp);
}

export async function copyText(s) {
  try { await navigator.clipboard.writeText(s); } catch (e) {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = s; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e2) {} ta.remove();
  }
  toast(t('copied'));
}

export function badge(text, kind) { return h('span.badge.' + (kind || 'neutral'), text); }

export const statusKind = { pending: 'warn', confirmed: 'info', processing: 'info', shipped: 'info', delivered: 'ok', cancelled: 'bad' };
export const payKind = { pending: 'warn', submitted: 'info', paid: 'ok', failed: 'bad', refunded: 'neutral' };

export function empty(icon, text, action) { return h('div.empty', h('div.empty-ico', icon), h('p', text), action || null); }

export function langButton(onToggle) {
  return h('button.lang-btn', { onclick: onToggle, 'aria-label': 'Switch language' }, '🌐 ', t('switchLang'));
}

export function demoBanner(mode) { return mode === 'demo' ? h('div.demo-banner', t('demoBanner')) : null; }

export function waLink(num, text) {
  const n = String(num || '').replace(/\D/g, '').replace(/^0/, '966');
  return 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '');
}

export function totals(items, settings) {
  const subtotal = items.reduce((s, it) => s + Number(it.price) * it.qty, 0);
  const free = settings.freeDeliveryOver > 0 && subtotal >= settings.freeDeliveryOver;
  const deliveryFee = items.length ? (free ? 0 : Number(settings.deliveryFee || 0)) : 0;
  const total = round2(subtotal + deliveryFee);
  const rate = Number(settings.vatRate || 15) / 100;
  const vat = settings.pricesIncludeVat ? round2(total - total / (1 + rate)) : round2(total * rate);
  return { subtotal: round2(subtotal), deliveryFee, vat, total: settings.pricesIncludeVat ? total : round2(total + vat) };
}
export const round2 = (n) => Math.round(Number(n) * 100) / 100;

export function errMsg(e) {
  if (e && e.message === 'INSUFFICIENT') return t('insufficientStock', { n: (e.items || []).join(', ') });
  if (e && String(e.code || e.message).includes('permission')) return getLang() === 'ar' ? 'تم رفض الإذن. تحقق من قواعد Firestore.' : 'Permission denied. Check Firestore rules.';
  if (!navigator.onLine) return t('errNetwork');
  return t('errGeneric');
}
