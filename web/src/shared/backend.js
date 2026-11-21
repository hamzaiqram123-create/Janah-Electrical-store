// Data layer. Uses Firebase (Auth + Firestore) when config is filled in,
// otherwise a local "demo" backend so the app can be previewed without a server.
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut as fbSignOut, sendPasswordResetEmail, updateProfile
} from 'firebase/auth';
import {
  initializeFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, runTransaction
} from 'firebase/firestore';

const CFG = (typeof window !== 'undefined' && window.JANAH_CONFIG) || {};
export const OWNER_EMAILS = (CFG.ownerEmails || ['akrambajwa062@gmail.com']).map(e => e.toLowerCase().trim());
export const isOwnerEmail = (email) => !!email && OWNER_EMAILS.includes(String(email).toLowerCase().trim());

const fbConf = CFG.firebase || {};
const hasFirebase = !!(fbConf.apiKey && fbConf.projectId && !String(fbConf.apiKey).includes('PASTE'));

export const DEFAULT_SETTINGS = {
  storeNameEn: 'Janah Al Riyadah', storeNameAr: 'جناح الريادة',
  phone: '', whatsapp: '', addressEn: 'Riyadh, Saudi Arabia', addressAr: 'الرياض، المملكة العربية السعودية',
  vatNumber: '', crNumber: '', vatRate: 15, pricesIncludeVat: true,
  deliveryFee: 25, freeDeliveryOver: 500,
  categories: [
    { id: 'lighting', en: 'Lighting', ar: 'الإنارة' },
    { id: 'wiring', en: 'Cables & wiring', ar: 'الكابلات والتمديدات' },
    { id: 'switches', en: 'Switches & sockets', ar: 'المفاتيح والأفياش' },
    { id: 'tools', en: 'Tools', ar: 'العدد والأدوات' },
    { id: 'parts', en: 'Appliance spare parts', ar: 'قطع غيار الأجهزة' },
  ],
  payment: {
    cod: { enabled: true, noteEn: 'Pay cash or card to the driver on delivery.', noteAr: 'ادفع نقدًا أو بالشبكة للمندوب عند الاستلام.' },
    bank: { enabled: true, bankName: '', accountName: '', iban: '', requireReceipt: true,
      noteEn: 'Transfer the total to the account below, then enter the reference and upload the receipt.',
      noteAr: 'حوّل المبلغ الإجمالي إلى الحساب التالي ثم أدخل رقم المرجع وارفع صورة الإيصال.' },
    stcpay: { enabled: false, number: '', noteEn: 'Send the total to our STC Pay number and enter the transaction number.', noteAr: 'أرسل المبلغ إلى رقم STC Pay الخاص بنا وأدخل رقم العملية.' },
    card: { enabled: false, moyasarPublishableKey: '' },
  },
  checkoutFields: [
    { id: 'f_time', labelEn: 'Preferred delivery time', labelAr: 'وقت التوصيل المفضل', type: 'select', required: false,
      options: 'Morning / صباحًا, Afternoon / ظهرًا, Evening / مساءً' },
  ],
};

export function mergeSettings(s) {
  const d = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (!s) return d;
  const out = { ...d, ...s };
  out.payment = { ...d.payment, ...(s.payment || {}) };
  for (const k of Object.keys(d.payment)) out.payment[k] = { ...d.payment[k], ...((s.payment || {})[k] || {}) };
  if (!Array.isArray(out.categories)) out.categories = d.categories;
  if (!Array.isArray(out.checkoutFields)) out.checkoutFields = [];
  return out;
}

export function makeOrderNo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'JR' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + Math.floor(1000 + Math.random() * 9000);
}

const byCreatedDesc = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

// ----------------------------------------------------------------- Firebase
function firebaseBackend() {
  const app = initializeApp(fbConf);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, ignoreUndefinedProperties: true });
  const snapList = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // connection state: a snapshot that is NOT from cache means the server answered
  let connected = null; const connL = new Set();
  const setConn = (v) => { if (connected !== v) { connected = v; connL.forEach(f => f(v)); } };
  // writes wait for the server; if it never answers, fail instead of spinning forever
  const T = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => { const e = new Error('timeout'); e.code = 'unavailable'; rej(e); }, 15000))]);
  const onErr = (cb) => (e) => { console.error(e); cb && cb(null, e); };

  return {
    mode: 'firebase',
    isConnected: () => connected,
    onConnection: (f) => { connL.add(f); return () => connL.delete(f); },
    auth: {
      onChange: (cb) => onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email, name: u.displayName } : null)),
      signIn: (email, pw) => signInWithEmailAndPassword(auth, email.trim(), pw),
      async signUp({ name, phone, email, password }) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        try { await updateProfile(cred.user, { displayName: name }); } catch (e) {}
        await setDoc(doc(db, 'users', cred.user.uid), { name, phone, email: email.trim(), createdAt: Date.now() }, { merge: true });
        return cred;
      },
      signOut: () => fbSignOut(auth),
      reset: (email) => sendPasswordResetEmail(auth, email.trim()),
    },
    async getProfile(uid) { const s = await getDoc(doc(db, 'users', uid)); return s.exists() ? s.data() : null; },
    saveProfile: (uid, data) => setDoc(doc(db, 'users', uid), { ...data, updatedAt: Date.now() }, { merge: true }),

    watchSettings: (cb) => onSnapshot(doc(db, 'settings', 'store'), { includeMetadataChanges: true }, (s) => { setConn(!s.metadata.fromCache); cb(mergeSettings(s.exists() ? s.data() : null)); }, onErr(cb)),
    saveSettings: (data) => T(setDoc(doc(db, 'settings', 'store'), { ...data, updatedAt: Date.now() })),

    watchProducts: (cb) => onSnapshot(collection(db, 'products'), (s) => cb(snapList(s).sort(byCreatedDesc)), onErr(cb)),
    async saveProduct(p) {
      const { id, ...data } = p; data.updatedAt = Date.now();
      if (id) { await T(updateDoc(doc(db, 'products', id), data)); return id; }
      data.createdAt = Date.now();
      const r = await T(addDoc(collection(db, 'products'), data)); return r.id;
    },
    deleteProduct: (id) => T(deleteDoc(doc(db, 'products', id))),
    setStock: (id, stock) => T(updateDoc(doc(db, 'products', id), { stock: Number(stock), updatedAt: Date.now() })),

    async createOrder(order) {
      const data = { ...order, orderNo: makeOrderNo(), status: 'pending', stockDeducted: false,
        history: [{ status: 'pending', at: Date.now() }], createdAt: Date.now(), updatedAt: Date.now() };
      const r = await T(addDoc(collection(db, 'orders'), data));
      return { id: r.id, ...data };
    },
    watchMyOrders: (uid, cb) => onSnapshot(query(collection(db, 'orders'), where('uid', '==', uid)), (s) => cb(snapList(s).sort(byCreatedDesc)), onErr(cb)),
    watchAllOrders: (cb) => onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500)), (s) => cb(snapList(s)), onErr(cb)),
    updateOrder: (id, patch) => T(updateDoc(doc(db, 'orders', id), { ...patch, updatedAt: Date.now() })),
    async customerCancel(order) {
      await T(updateDoc(doc(db, 'orders', order.id), { status: 'cancelled', history: [...(order.history || []), { status: 'cancelled', at: Date.now(), by: 'customer' }], updatedAt: Date.now() }));
    },
    // Owner: change status; deducts stock on confirm, restores it on cancel (atomic transaction)
    async setOrderStatus(id, status) {
      await T(runTransaction(db, async (tx) => {
        const oref = doc(db, 'orders', id);
        const os = await tx.get(oref); if (!os.exists()) throw new Error('Order not found');
        const o = os.data();
        const patch = { status, history: [...(o.history || []), { status, at: Date.now() }], updatedAt: Date.now() };
        const needDeduct = ['confirmed', 'processing', 'shipped', 'delivered'].includes(status) && !o.stockDeducted;
        const needRestore = status === 'cancelled' && o.stockDeducted;
        if (needDeduct || needRestore) {
          const refs = o.items.map(it => doc(db, 'products', it.productId));
          const snaps = [];
          for (const r of refs) snaps.push(await tx.get(r));
          if (needDeduct) {
            const short = o.items.filter((it, i) => !snaps[i].exists() || (snaps[i].data().stock || 0) < it.qty).map(it => it.nameEn || it.nameAr);
            if (short.length) { const e = new Error('INSUFFICIENT'); e.items = short; throw e; }
          }
          o.items.forEach((it, i) => {
            if (!snaps[i].exists()) return;
            const cur = Number(snaps[i].data().stock || 0);
            tx.update(refs[i], { stock: needDeduct ? cur - it.qty : cur + it.qty, updatedAt: Date.now() });
          });
          patch.stockDeducted = needDeduct;
        }
        tx.update(oref, patch);
      }));
    },

    createService: (s) => T(addDoc(collection(db, 'services'), { ...s, status: 'new', createdAt: Date.now(), updatedAt: Date.now() })),
    watchMyServices: (uid, cb) => onSnapshot(query(collection(db, 'services'), where('uid', '==', uid)), (s) => cb(snapList(s).sort(byCreatedDesc)), onErr(cb)),
    watchAllServices: (cb) => onSnapshot(query(collection(db, 'services'), orderBy('createdAt', 'desc'), limit(300)), (s) => cb(snapList(s)), onErr(cb)),
    updateService: (id, patch) => T(updateDoc(doc(db, 'services', id), { ...patch, updatedAt: Date.now() })),
  };
}

// ----------------------------------------------------------------- Demo (local)
function safeStore(kind) {
  try { const st = window[kind]; st.setItem('_t', '1'); st.removeItem('_t'); return st; }
  catch (e) { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; }
}
export const LS = safeStore('localStorage');
export const SS = safeStore('sessionStorage');

function demoBackend() {
  const localStorage = LS;
  const K = (c) => 'janah_demo_' + c;
  const read = (c, def) => { try { const v = localStorage.getItem(K(c)); return v ? JSON.parse(v) : def; } catch (e) { return def; } };
  const subs = {};
  const emit = (c) => (subs[c] || new Set()).forEach(fn => fn());
  const write = (c, v) => { localStorage.setItem(K(c), JSON.stringify(v)); emit(c); };
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('janah_demo_')) emit(e.key.slice(11)); });
  const sub = (c, fn) => { (subs[c] = subs[c] || new Set()).add(fn); fn(); return () => subs[c].delete(fn); };
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const delay = (v) => new Promise(r => setTimeout(() => r(v), 150));

  if (!read('seeded', false)) {
    write('users_auth', [{ uid: 'owner1', email: OWNER_EMAILS[0], password: 'demo1234', name: 'Owner' }]);
    write('products', demoProducts());
    write('seeded', true);
  }

  // each app keeps its own sign-in (like two separate apps on a phone)
  const SESSION = 'session_' + (typeof __APP__ !== 'undefined' ? __APP__ : 'app');
  let authListeners = new Set();
  const currentUser = () => read(SESSION, null);
  const setSession = (u) => { write(SESSION, u); authListeners.forEach(fn => fn(u)); };
  window.addEventListener('storage', (e) => { if (e.key === K(SESSION)) authListeners.forEach(fn => fn(currentUser())); });
  const err = (code) => { const e = new Error(code); e.code = code; return e; };

  return {
    mode: 'demo',
    isConnected: () => true,
    onConnection: () => () => {},
    auth: {
      onChange(cb) { authListeners.add(cb); setTimeout(() => cb(currentUser()), 0); return () => authListeners.delete(cb); },
      async signIn(email, pw) {
        const u = read('users_auth', []).find(x => x.email.toLowerCase() === email.trim().toLowerCase());
        if (!u || u.password !== pw) throw err('auth/invalid-credential');
        setSession({ uid: u.uid, email: u.email, name: u.name }); return delay();
      },
      async signUp({ name, phone, email, password }) {
        const list = read('users_auth', []);
        if (list.some(x => x.email.toLowerCase() === email.trim().toLowerCase())) throw err('auth/email-already-in-use');
        if (password.length < 6) throw err('auth/weak-password');
        const u = { uid: uid(), email: email.trim(), password, name };
        write('users_auth', [...list, u]);
        const prof = read('users', {}); prof[u.uid] = { name, phone, email: u.email, createdAt: Date.now() }; write('users', prof);
        setSession({ uid: u.uid, email: u.email, name }); return delay();
      },
      async signOut() { setSession(null); },
      async reset() { return delay(); },
    },
    async getProfile(id) { return read('users', {})[id] || null; },
    async saveProfile(id, data) { const p = read('users', {}); p[id] = { ...(p[id] || {}), ...data }; write('users', p); },

    watchSettings: (cb) => sub('settings', () => cb(mergeSettings(read('settings', null)))),
    async saveSettings(data) { write('settings', data); return delay(); },

    watchProducts: (cb) => sub('products', () => cb(read('products', []).slice().sort(byCreatedDesc))),
    async saveProduct(p) {
      const list = read('products', []);
      if (p.id) { const i = list.findIndex(x => x.id === p.id); list[i] = { ...list[i], ...p, updatedAt: Date.now() }; write('products', list); return p.id; }
      const id = uid(); list.push({ ...p, id, createdAt: Date.now(), updatedAt: Date.now() }); write('products', list); return id;
    },
    async deleteProduct(id) { write('products', read('products', []).filter(x => x.id !== id)); },
    async setStock(id, stock) { const l = read('products', []); const p = l.find(x => x.id === id); if (p) p.stock = Number(stock); write('products', l); },

    async createOrder(order) {
      const data = { ...order, id: uid(), orderNo: makeOrderNo(), status: 'pending', stockDeducted: false,
        history: [{ status: 'pending', at: Date.now() }], createdAt: Date.now(), updatedAt: Date.now() };
      write('orders', [...read('orders', []), data]); return delay(data);
    },
    watchMyOrders: (u, cb) => sub('orders', () => cb(read('orders', []).filter(o => o.uid === u).sort(byCreatedDesc))),
    watchAllOrders: (cb) => sub('orders', () => cb(read('orders', []).slice().sort(byCreatedDesc))),
    async updateOrder(id, patch) { const l = read('orders', []); const o = l.find(x => x.id === id); Object.assign(o, patch, { updatedAt: Date.now() }); write('orders', l); },
    async customerCancel(order) { await this.updateOrder(order.id, { status: 'cancelled', history: [...(order.history || []), { status: 'cancelled', at: Date.now(), by: 'customer' }] }); },
    async setOrderStatus(id, status) {
      const orders = read('orders', []); const o = orders.find(x => x.id === id);
      const prods = read('products', []);
      const needDeduct = ['confirmed', 'processing', 'shipped', 'delivered'].includes(status) && !o.stockDeducted;
      const needRestore = status === 'cancelled' && o.stockDeducted;
      if (needDeduct) {
        const short = o.items.filter(it => { const p = prods.find(x => x.id === it.productId); return !p || (p.stock || 0) < it.qty; }).map(it => it.nameEn || it.nameAr);
        if (short.length) { const e = new Error('INSUFFICIENT'); e.items = short; throw e; }
      }
      if (needDeduct || needRestore) {
        o.items.forEach(it => { const p = prods.find(x => x.id === it.productId); if (p) p.stock = Number(p.stock || 0) + (needDeduct ? -it.qty : it.qty); });
        o.stockDeducted = needDeduct; write('products', prods);
      }
      o.status = status; o.history = [...(o.history || []), { status, at: Date.now() }]; o.updatedAt = Date.now();
      write('orders', orders); return delay();
    },

    async createService(s) { write('services', [...read('services', []), { ...s, id: uid(), status: 'new', createdAt: Date.now() }]); return delay(); },
    watchMyServices: (u, cb) => sub('services', () => cb(read('services', []).filter(o => o.uid === u).sort(byCreatedDesc))),
    watchAllServices: (cb) => sub('services', () => cb(read('services', []).slice().sort(byCreatedDesc))),
    async updateService(id, patch) { const l = read('services', []); Object.assign(l.find(x => x.id === id), patch, { updatedAt: Date.now() }); write('services', l); },
  };
}

function svgImg(bg, emoji) {
  const s = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='400' height='400' fill='${bg}'/><text x='200' y='250' font-size='170' text-anchor='middle'>${emoji}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}
function demoProducts() {
  const now = Date.now();
  return [
    ['LED Bulb 12W (pack of 4)', 'لمبة LED ‏12 واط (4 حبات)', 'lighting', 39, 49, 60, '💡', '#FFF4D6'],
    ['Copper cable 2.5mm – 100m', 'سلك نحاس 2.5 مم – 100 متر', 'wiring', 185, 0, 25, '🧵', '#E6F2EC'],
    ['Double wall socket 13A', 'فيش جداري مزدوج 13 أمبير', 'switches', 22, 0, 4, '🔌', '#EAF0FA'],
    ['Digital multimeter', 'جهاز قياس رقمي (ملتيميتر)', 'tools', 95, 120, 12, '🛠️', '#F3ECFA'],
    ['AC capacitor 35µF', 'مكثف مكيف 35 مايكروفاراد', 'parts', 30, 0, 40, '🔋', '#FDECEC'],
    ['Outdoor LED flood light 100W', 'كشاف LED خارجي 100 واط', 'lighting', 145, 0, 8, '🔦', '#FFF4D6'],
  ].map(([en, ar, cat, price, old, stock, em, bg], i) => ({
    id: 'demo' + i, nameEn: en, nameAr: ar, category: cat, price, oldPrice: old || null, stock, lowStock: 5, sku: 'JR-' + (1001 + i),
    descEn: 'Quality product, 1-year warranty. Delivered across Saudi Arabia.', descAr: 'منتج عالي الجودة مع ضمان سنة. توصيل لجميع مناطق المملكة.',
    image: svgImg(bg, em), active: true, createdAt: now - i * 1000, updatedAt: now,
  }));
}

export const backend = hasFirebase ? firebaseBackend() : demoBackend();

export function authErrorKey(e) {
  const c = (e && (e.code || e.message)) || '';
  const map = {
    'auth/invalid-credential': ['Wrong email or password', 'البريد أو كلمة المرور غير صحيحة'],
    'auth/wrong-password': ['Wrong email or password', 'البريد أو كلمة المرور غير صحيحة'],
    'auth/user-not-found': ['Wrong email or password', 'البريد أو كلمة المرور غير صحيحة'],
    'auth/email-already-in-use': ['This email already has an account. Sign in instead.', 'هذا البريد مسجل مسبقًا. سجّل الدخول.'],
    'auth/weak-password': ['Password must be at least 6 characters', 'كلمة المرور يجب ألا تقل عن 6 أحرف'],
    'auth/invalid-email': ['Enter a valid email', 'أدخل بريدًا إلكترونيًا صحيحًا'],
    'auth/network-request-failed': ['No internet connection', 'لا يوجد اتصال بالإنترنت'],
    'auth/too-many-requests': ['Too many attempts. Try again later.', 'محاولات كثيرة. حاول لاحقًا.'],
    'permission-denied': ['Permission denied. Check Firestore rules.', 'تم رفض الإذن. تحقق من قواعد Firestore.'],
  };
  for (const k in map) if (c.includes(k)) return map[k];
  return null;
}
