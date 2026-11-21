// English / Arabic dictionary + language switching (RTL for Arabic)
const dict = {
  en: {
    appName: 'Janah Al Riyadah',
    tagline: 'Electrical products & repair',
    ownerApp: 'Owner',
    switchLang: 'العربية',
    home: 'Home', shop: 'Shop', cart: 'Cart', orders: 'Orders', account: 'Account', services: 'Repair',
    dashboard: 'Dashboard', products: 'Products', inventory: 'Inventory', settings: 'Settings', more: 'More',
    search: 'Search products…', all: 'All', categories: 'Categories',
    addToCart: 'Add to cart', added: 'Added to cart', outOfStock: 'Out of stock', inStock: 'In stock', onlyLeft: 'Only {n} left',
    qty: 'Qty', price: 'Price', total: 'Total', subtotal: 'Subtotal', delivery: 'Delivery', vat: 'VAT (15%)', vatIncluded: 'incl. VAT',
    free: 'Free', freeOver: 'Free delivery on orders over {n}',
    emptyCart: 'Your cart is empty', continueShopping: 'Continue shopping', checkout: 'Checkout', remove: 'Remove',
    checkoutTitle: 'Delivery & payment details', yourDetails: 'Your details', fullName: 'Full name', phone: 'Mobile number', email: 'Email',
    city: 'City', district: 'District', address: 'Street address / building', notes: 'Order notes (optional)',
    paymentMethod: 'Payment method', placeOrder: 'Place order', placing: 'Placing order…',
    cod: 'Cash on delivery', bank: 'Bank transfer', stcpay: 'STC Pay', card: 'Mada / Visa / Mastercard',
    bankName: 'Bank name', accountName: 'Account name', iban: 'IBAN', copy: 'Copy', copied: 'Copied',
    transferRef: 'Transfer reference / transaction no.', uploadReceipt: 'Upload receipt (photo)', receipt: 'Receipt', changePhoto: 'Change photo',
    stcNumber: 'STC Pay number', cardName: 'Name on card', cardNumber: 'Card number', expiry: 'Expiry (MM/YY)', cvc: 'CVC',
    payNow: 'Pay {n} now', securePay: 'Secured by Moyasar. Your card details go directly to the payment gateway.',
    required: 'Required', invalidPhone: 'Enter a valid Saudi mobile (05XXXXXXXX)', invalidEmail: 'Enter a valid email',
    orderPlaced: 'Order placed!', orderNo: 'Order no.', thankYou: 'Thank you. We will confirm your order shortly.',
    viewOrders: 'View my orders', myOrders: 'My orders', noOrders: 'No orders yet', orderDetails: 'Order details', items: 'Items',
    status: 'Status', date: 'Date', payment: 'Payment', cancelOrder: 'Cancel order', confirmCancel: 'Cancel this order?',
    st_pending: 'Pending', st_confirmed: 'Confirmed', st_processing: 'Preparing', st_shipped: 'Out for delivery', st_delivered: 'Delivered', st_cancelled: 'Cancelled',
    ps_pending: 'Not paid', ps_submitted: 'Proof submitted', ps_paid: 'Paid', ps_failed: 'Failed', ps_refunded: 'Refunded',
    login: 'Sign in', register: 'Create account', logout: 'Sign out', password: 'Password', noAccount: "Don't have an account?", haveAccount: 'Already have an account?',
    forgot: 'Forgot password?', resetSent: 'Password reset email sent', signInToOrder: 'Sign in to place and track your orders',
    welcome: 'Welcome', profile: 'My profile', save: 'Save', saved: 'Saved', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', add: 'Add', close: 'Close', back: 'Back', yes: 'Yes', no: 'No', confirm: 'Confirm',
    language: 'Language', contactUs: 'Contact us', whatsapp: 'WhatsApp', call: 'Call',
    demoBanner: 'Demo mode: data is saved on this device only. Add your Firebase config to go live.',
    errGeneric: 'Something went wrong. Please try again.', errNetwork: 'No internet connection', loading: 'Loading…',
    // repair service
    bookRepair: 'Book a repair', repairIntro: 'AC, washing machine, fridge, wiring and more — our technician comes to you.',
    deviceType: 'Device / job type', problem: 'Describe the problem', preferredDate: 'Preferred date', submit: 'Submit', requestSent: 'Request sent. We will call you soon.',
    myRequests: 'My repair requests', noRequests: 'No repair requests yet',
    sv_new: 'New', sv_scheduled: 'Scheduled', sv_in_progress: 'In progress', sv_done: 'Completed', sv_cancelled: 'Cancelled',
    dev_ac: 'Air conditioner', dev_washer: 'Washing machine', dev_fridge: 'Refrigerator', dev_wiring: 'Electrical wiring', dev_heater: 'Water heater', dev_other: 'Other',
    // owner
    ownerLogin: 'Owner sign in', notOwner: 'This account is not the store owner.', todaySales: "Today's sales", pendingOrders: 'Pending orders',
    lowStock: 'Low stock', totalProducts: 'Products', recentOrders: 'Recent orders', revenue: 'Revenue (delivered)', newOrderAlert: 'New order received!',
    addProduct: 'Add product', editProduct: 'Edit product', nameEn: 'Name (English)', nameAr: 'Name (Arabic)', descEn: 'Description (English)', descAr: 'Description (Arabic)',
    category: 'Category', stock: 'Stock', sku: 'SKU / code', oldPrice: 'Old price (optional)', lowStockAt: 'Low-stock alert at', active: 'Visible in store',
    image: 'Photo', pickImage: 'Choose photo', confirmDelete: 'Delete this item?', productSaved: 'Product saved', noProducts: 'No products yet',
    adjust: 'Adjust', setStock: 'Set stock', stockUpdated: 'Stock updated', units: 'units',
    confirmOrder: 'Confirm order', markPaid: 'Mark as paid', markProcessing: 'Preparing', markShipped: 'Out for delivery', markDelivered: 'Delivered', rejectPayment: 'Payment failed',
    customer: 'Customer', stockDeducted: 'Stock deducted', priceChanged: 'Price differs from current product price', reference: 'Reference', method: 'Method',
    filterAll: 'All', openMap: 'Map', moyasarId: 'Gateway payment ID', verifyGateway: 'Verify this payment in your Moyasar dashboard before delivering.',
    insufficientStock: 'Not enough stock for: {n}',
    storeSettings: 'Store details', storeNameEn: 'Store name (English)', storeNameAr: 'Store name (Arabic)', vatNumber: 'VAT number', crNumber: 'CR number',
    addressEn: 'Address (English)', addressAr: 'Address (Arabic)', deliveryFee: 'Delivery fee (SAR)', freeDeliveryOver: 'Free delivery over (SAR, 0 = off)',
    paymentSettings: 'Payment methods', enabled: 'Enabled', noteEn: 'Instructions (English)', noteAr: 'Instructions (Arabic)', requireReceipt: 'Require receipt photo',
    moyasarKey: 'Moyasar publishable key (pk_live_… or pk_test_…)', moyasarHelp: 'Create a free merchant account at moyasar.com to accept Mada, Visa, Mastercard and Apple Pay.',
    formBuilder: 'Checkout form fields', formBuilderHelp: 'Extra questions customers answer at checkout.', addField: 'Add field', fieldLabelEn: 'Label (English)', fieldLabelAr: 'Label (Arabic)',
    fieldType: 'Type', ft_text: 'Text', ft_number: 'Number', ft_textarea: 'Long text', ft_select: 'Dropdown', ft_date: 'Date', options: 'Options (comma separated)', isRequired: 'Required',
    categoriesSettings: 'Product categories', addCategory: 'Add category', catEn: 'English', catAr: 'Arabic',
    serviceRequests: 'Repair requests', ownerNote: 'Note to customer', setStatus: 'Set status',
    exportCsv: 'Export orders (CSV)', firebaseStatus: 'Database', connected: 'Connected to Firebase', demoMode: 'Demo (this device only)',
  },
  ar: {
    appName: 'جناح الريادة',
    tagline: 'أدوات كهربائية وخدمات صيانة',
    ownerApp: 'المالك',
    switchLang: 'English',
    home: 'الرئيسية', shop: 'المتجر', cart: 'السلة', orders: 'الطلبات', account: 'حسابي', services: 'الصيانة',
    dashboard: 'لوحة التحكم', products: 'المنتجات', inventory: 'المخزون', settings: 'الإعدادات', more: 'المزيد',
    search: 'ابحث عن منتج…', all: 'الكل', categories: 'الأقسام',
    addToCart: 'أضف إلى السلة', added: 'تمت الإضافة إلى السلة', outOfStock: 'نفدت الكمية', inStock: 'متوفر', onlyLeft: 'متبقي {n} فقط',
    qty: 'الكمية', price: 'السعر', total: 'الإجمالي', subtotal: 'المجموع الفرعي', delivery: 'التوصيل', vat: 'ضريبة القيمة المضافة (15%)', vatIncluded: 'شامل الضريبة',
    free: 'مجاني', freeOver: 'توصيل مجاني للطلبات فوق {n}',
    emptyCart: 'سلتك فارغة', continueShopping: 'تابع التسوق', checkout: 'إتمام الطلب', remove: 'حذف',
    checkoutTitle: 'بيانات التوصيل والدفع', yourDetails: 'بياناتك', fullName: 'الاسم الكامل', phone: 'رقم الجوال', email: 'البريد الإلكتروني',
    city: 'المدينة', district: 'الحي', address: 'العنوان / المبنى', notes: 'ملاحظات الطلب (اختياري)',
    paymentMethod: 'طريقة الدفع', placeOrder: 'تأكيد الطلب', placing: 'جارٍ إرسال الطلب…',
    cod: 'الدفع عند الاستلام', bank: 'تحويل بنكي', stcpay: 'STC Pay', card: 'مدى / فيزا / ماستركارد',
    bankName: 'اسم البنك', accountName: 'اسم الحساب', iban: 'الآيبان', copy: 'نسخ', copied: 'تم النسخ',
    transferRef: 'رقم مرجع التحويل / العملية', uploadReceipt: 'ارفع صورة الإيصال', receipt: 'الإيصال', changePhoto: 'تغيير الصورة',
    stcNumber: 'رقم STC Pay', cardName: 'الاسم على البطاقة', cardNumber: 'رقم البطاقة', expiry: 'تاريخ الانتهاء (شهر/سنة)', cvc: 'الرمز السري',
    payNow: 'ادفع {n} الآن', securePay: 'دفع آمن عبر ميسر. بيانات بطاقتك تُرسل مباشرة إلى بوابة الدفع.',
    required: 'مطلوب', invalidPhone: 'أدخل رقم جوال سعودي صحيح (05XXXXXXXX)', invalidEmail: 'أدخل بريدًا إلكترونيًا صحيحًا',
    orderPlaced: 'تم إرسال طلبك!', orderNo: 'رقم الطلب', thankYou: 'شكرًا لك. سنقوم بتأكيد طلبك قريبًا.',
    viewOrders: 'عرض طلباتي', myOrders: 'طلباتي', noOrders: 'لا توجد طلبات بعد', orderDetails: 'تفاصيل الطلب', items: 'المنتجات',
    status: 'الحالة', date: 'التاريخ', payment: 'الدفع', cancelOrder: 'إلغاء الطلب', confirmCancel: 'هل تريد إلغاء هذا الطلب؟',
    st_pending: 'قيد الانتظار', st_confirmed: 'مؤكد', st_processing: 'قيد التجهيز', st_shipped: 'في الطريق إليك', st_delivered: 'تم التوصيل', st_cancelled: 'ملغي',
    ps_pending: 'غير مدفوع', ps_submitted: 'تم إرسال الإثبات', ps_paid: 'مدفوع', ps_failed: 'فشل الدفع', ps_refunded: 'مسترد',
    login: 'تسجيل الدخول', register: 'إنشاء حساب', logout: 'تسجيل الخروج', password: 'كلمة المرور', noAccount: 'ليس لديك حساب؟', haveAccount: 'لديك حساب بالفعل؟',
    forgot: 'نسيت كلمة المرور؟', resetSent: 'تم إرسال رابط إعادة تعيين كلمة المرور', signInToOrder: 'سجّل الدخول لإرسال طلباتك ومتابعتها',
    welcome: 'مرحبًا', profile: 'ملفي الشخصي', save: 'حفظ', saved: 'تم الحفظ', cancel: 'إلغاء', delete: 'حذف', edit: 'تعديل', add: 'إضافة', close: 'إغلاق', back: 'رجوع', yes: 'نعم', no: 'لا', confirm: 'تأكيد',
    language: 'اللغة', contactUs: 'تواصل معنا', whatsapp: 'واتساب', call: 'اتصال',
    demoBanner: 'وضع تجريبي: البيانات محفوظة على هذا الجهاز فقط. أضف إعدادات Firebase للتشغيل الفعلي.',
    errGeneric: 'حدث خطأ. حاول مرة أخرى.', errNetwork: 'لا يوجد اتصال بالإنترنت', loading: 'جارٍ التحميل…',
    bookRepair: 'اطلب صيانة', repairIntro: 'مكيفات، غسالات، ثلاجات، تمديدات كهربائية والمزيد — الفني يصل إليك.',
    deviceType: 'نوع الجهاز / العمل', problem: 'صف المشكلة', preferredDate: 'التاريخ المفضل', submit: 'إرسال', requestSent: 'تم إرسال الطلب. سنتصل بك قريبًا.',
    myRequests: 'طلبات الصيانة', noRequests: 'لا توجد طلبات صيانة بعد',
    sv_new: 'جديد', sv_scheduled: 'تمت الجدولة', sv_in_progress: 'قيد التنفيذ', sv_done: 'مكتمل', sv_cancelled: 'ملغي',
    dev_ac: 'مكيف', dev_washer: 'غسالة', dev_fridge: 'ثلاجة', dev_wiring: 'تمديدات كهربائية', dev_heater: 'سخان ماء', dev_other: 'أخرى',
    ownerLogin: 'دخول المالك', notOwner: 'هذا الحساب ليس حساب مالك المتجر.', todaySales: 'مبيعات اليوم', pendingOrders: 'طلبات بانتظار التأكيد',
    lowStock: 'مخزون منخفض', totalProducts: 'المنتجات', recentOrders: 'أحدث الطلبات', revenue: 'الإيرادات (المسلّمة)', newOrderAlert: 'وصل طلب جديد!',
    addProduct: 'إضافة منتج', editProduct: 'تعديل المنتج', nameEn: 'الاسم (إنجليزي)', nameAr: 'الاسم (عربي)', descEn: 'الوصف (إنجليزي)', descAr: 'الوصف (عربي)',
    category: 'القسم', stock: 'المخزون', sku: 'الرمز / الكود', oldPrice: 'السعر قبل الخصم (اختياري)', lowStockAt: 'تنبيه المخزون عند', active: 'ظاهر في المتجر',
    image: 'الصورة', pickImage: 'اختر صورة', confirmDelete: 'هل تريد حذف هذا العنصر؟', productSaved: 'تم حفظ المنتج', noProducts: 'لا توجد منتجات بعد',
    adjust: 'تعديل', setStock: 'تحديد المخزون', stockUpdated: 'تم تحديث المخزون', units: 'وحدة',
    confirmOrder: 'تأكيد الطلب', markPaid: 'تم الدفع', markProcessing: 'قيد التجهيز', markShipped: 'في الطريق', markDelivered: 'تم التوصيل', rejectPayment: 'فشل الدفع',
    customer: 'العميل', stockDeducted: 'تم خصم المخزون', priceChanged: 'السعر يختلف عن السعر الحالي للمنتج', reference: 'المرجع', method: 'الطريقة',
    filterAll: 'الكل', openMap: 'الخريطة', moyasarId: 'رقم العملية في البوابة', verifyGateway: 'تحقق من هذه العملية في لوحة ميسر قبل التسليم.',
    insufficientStock: 'المخزون غير كافٍ لـ: {n}',
    storeSettings: 'بيانات المتجر', storeNameEn: 'اسم المتجر (إنجليزي)', storeNameAr: 'اسم المتجر (عربي)', vatNumber: 'الرقم الضريبي', crNumber: 'السجل التجاري',
    addressEn: 'العنوان (إنجليزي)', addressAr: 'العنوان (عربي)', deliveryFee: 'رسوم التوصيل (ريال)', freeDeliveryOver: 'توصيل مجاني فوق (ريال، 0 = إيقاف)',
    paymentSettings: 'طرق الدفع', enabled: 'مفعّل', noteEn: 'التعليمات (إنجليزي)', noteAr: 'التعليمات (عربي)', requireReceipt: 'إلزام رفع صورة الإيصال',
    moyasarKey: 'مفتاح ميسر العام (pk_live_… أو pk_test_…)', moyasarHelp: 'أنشئ حساب تاجر مجاني في moyasar.com لقبول مدى وفيزا وماستركارد وApple Pay.',
    formBuilder: 'حقول نموذج الطلب', formBuilderHelp: 'أسئلة إضافية يجيب عنها العميل عند إتمام الطلب.', addField: 'إضافة حقل', fieldLabelEn: 'العنوان (إنجليزي)', fieldLabelAr: 'العنوان (عربي)',
    fieldType: 'النوع', ft_text: 'نص', ft_number: 'رقم', ft_textarea: 'نص طويل', ft_select: 'قائمة', ft_date: 'تاريخ', options: 'الخيارات (مفصولة بفاصلة)', isRequired: 'إلزامي',
    categoriesSettings: 'أقسام المنتجات', addCategory: 'إضافة قسم', catEn: 'إنجليزي', catAr: 'عربي',
    serviceRequests: 'طلبات الصيانة', ownerNote: 'ملاحظة للعميل', setStatus: 'تغيير الحالة',
    exportCsv: 'تصدير الطلبات (CSV)', firebaseStatus: 'قاعدة البيانات', connected: 'متصل بـ Firebase', demoMode: 'تجريبي (هذا الجهاز فقط)',
  }
};

let lang = 'ar';
try {
  const saved = localStorage.getItem('janah_lang');
  lang = saved || ((navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'ar');
} catch (e) {}
if (lang !== 'en' && lang !== 'ar') lang = 'ar';

const listeners = new Set();

export function getLang() { return lang; }
export function isAr() { return lang === 'ar'; }

export function t(key, vars) {
  let s = (dict[lang] && dict[lang][key]) ?? dict.en[key] ?? key;
  if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]);
  return s;
}

/** Pick the localized field of an object: L(p,'name') -> p.nameAr / p.nameEn */
export function L(obj, base) {
  if (!obj) return '';
  const a = obj[base + 'Ar'], e = obj[base + 'En'];
  return lang === 'ar' ? (a || e || '') : (e || a || '');
}

export function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export function setLang(l) {
  lang = l;
  try { localStorage.setItem('janah_lang', l); } catch (e) {}
  applyLang();
  listeners.forEach(fn => fn(l));
}

export function toggleLang() { setLang(lang === 'ar' ? 'en' : 'ar'); }
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
