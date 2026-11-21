// Moyasar (Saudi payment gateway: Mada, Visa, Mastercard) — client-side "custom form" flow.
// Only the PUBLISHABLE key is used in the app; the secret key must never be put in the app.
const PENDING_KEY = 'janah_pending_payment';

export function luhnOk(num) {
  const s = String(num).replace(/\D/g, '');
  if (s.length < 13 || s.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = +s[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

export function parseExpiry(v) {
  const m = String(v || '').replace(/\s/g, '').match(/^(\d{1,2})\/?(\d{2}|\d{4})$/);
  if (!m) return null;
  const month = +m[1]; let year = +m[2]; if (year < 100) year += 2000;
  if (month < 1 || month > 12) return null;
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) return null;
  return { month, year };
}

export function callbackUrl() {
  return location.origin + location.pathname; // e.g. https://appassets.androidplatform.net/assets/www/index.html
}

/** Creates the payment and sends the user to the bank's 3-D Secure page. */
export async function startMoyasarPayment({ publishableKey, amountSAR, orderId, orderNo, card }) {
  const exp = parseExpiry(card.expiry);
  const body = {
    amount: Math.round(Number(amountSAR) * 100), // halalas
    currency: 'SAR',
    description: 'Order ' + orderNo,
    callback_url: callbackUrl(),
    source: {
      type: 'creditcard', name: card.name.trim(), number: card.number.replace(/\D/g, ''),
      cvc: card.cvc.trim(), month: exp.month, year: exp.year,
    },
    metadata: { order_id: orderId, order_no: orderNo },
  };
  const res = await fetch('https://api.moyasar.com/v1/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(publishableKey.trim() + ':') },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || (data.errors ? Object.values(data.errors).flat().join(', ') : 'Payment failed');
    const e = new Error(msg); e.gateway = true; throw e;
  }
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ orderId, paymentId: data.id, at: Date.now() })); } catch (e) {}
  const url = data.source && data.source.transaction_url;
  if (url) { location.href = url; return { redirected: true, payment: data }; }
  return { redirected: false, payment: data }; // already final (rare)
}

/** After the bank page, Moyasar redirects to callback_url?id=..&status=..&message=.. */
export function readPaymentReturn() {
  const p = new URLSearchParams(location.search);
  const id = p.get('id'), status = p.get('status');
  if (!id || !status) return null;
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); localStorage.removeItem(PENDING_KEY); } catch (e) {}
  history.replaceState(null, '', location.pathname + location.hash);
  return { id, status, message: p.get('message') || '', orderId: pending && pending.orderId };
}
