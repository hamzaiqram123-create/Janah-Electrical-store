/**
 * Starting text for the legal pages. It reflects how this store actually works (7-day returns, VAT-inclusive prices,
 * hosted card payments) but it is a template: have it reviewed for your business before going live.
 * Format: "## " headings, "- " list items, blank line between paragraphs. Editable in Admin → Content → Pages.
 */
export const PAGES: { slug: string; title: [string, string, string]; body: [string, string, string] }[] = [
  {
    slug: "privacy",
    title: ["سياسة الخصوصية", "Privacy Policy", "رازداری کی پالیسی"],
    body: [
`توضح هذه السياسة كيف تجمع شركة جناح الريادة بياناتك الشخصية وتستخدمها وتحميها عند استخدامك للمتجر الإلكتروني، وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية.

## البيانات التي نجمعها
- بيانات الحساب والطلب: الاسم، البريد الإلكتروني، رقم الجوال، عنوان التوصيل، والرقم الضريبي للمنشآت إن وُجد.
- بيانات الطلبات: المنتجات المطلوبة، المبالغ، حالة الدفع والتوصيل.
- بيانات تقنية: عنوان IP ونوع المتصفح وملفات تعريف الارتباط الضرورية لتشغيل السلة وتسجيل الدخول.

## كيف نستخدم بياناتك
- تنفيذ الطلبات وتوصيلها وإصدار الفواتير الضريبية.
- التواصل معك بخصوص طلبك عبر البريد الإلكتروني أو الرسائل النصية أو واتساب.
- الالتزام بالمتطلبات النظامية، ومنها متطلبات هيئة الزكاة والضريبة والجمارك.
- إرسال العروض التسويقية فقط إذا وافقت على ذلك، ويمكنك إلغاء الاشتراك في أي وقت.

## بيانات الدفع
تتم عمليات الدفع الإلكتروني عبر صفحة آمنة لدى مزوّد خدمة الدفع المرخّص. لا نخزّن أرقام البطاقات أو رموز التحقق على خوادمنا.

## مشاركة البيانات
نشارك الحد الأدنى من البيانات اللازمة مع شركات الشحن ومزوّد خدمة الدفع ومزوّدي خدمات الرسائل لتنفيذ طلبك فقط، ولا نبيع بياناتك لأي طرف.

## حقوقك
يحق لك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها، وذلك عبر صفحة «تواصل معنا». نحتفظ ببيانات الفواتير للمدة التي تتطلبها الأنظمة الضريبية.`,
`This policy explains how Janah Al Riyada Co. collects, uses and protects your personal data when you use the online store, in line with the Saudi Personal Data Protection Law.

## Data we collect
- Account and order details: name, email, mobile number, delivery address, and a VAT number for businesses where provided.
- Order data: products ordered, amounts, payment and delivery status.
- Technical data: IP address, browser type and the cookies needed to run the cart and sign-in.

## How we use your data
- To fulfil and deliver orders and issue tax invoices.
- To contact you about your order by email, SMS or WhatsApp.
- To meet legal obligations, including ZATCA requirements.
- To send marketing offers only if you opted in. You can unsubscribe at any time.

## Payment data
Online payments are made on a secure page hosted by a licensed payment service provider. We do not store card numbers or security codes on our servers.

## Sharing
We share the minimum data needed with couriers, the payment provider and messaging providers solely to fulfil your order. We never sell your data.

## Your rights
You may ask to access, correct or delete your data through the Contact us page. Invoice records are kept for the period required by tax regulations.`,
`یہ پالیسی بتاتی ہے کہ جناح الریادہ کمپنی آن لائن اسٹور کے استعمال کے دوران آپ کا ذاتی ڈیٹا کیسے جمع، استعمال اور محفوظ کرتی ہے، سعودی پرسنل ڈیٹا پروٹیکشن قانون کے مطابق۔

## ہم کون سا ڈیٹا جمع کرتے ہیں
- اکاؤنٹ اور آرڈر کی تفصیلات: نام، ای میل، موبائل نمبر، ڈیلیوری کا پتہ، اور اداروں کے لیے VAT نمبر۔
- آرڈر کا ڈیٹا: مصنوعات، رقوم، ادائیگی اور ڈیلیوری کی صورتحال۔
- تکنیکی ڈیٹا: آئی پی ایڈریس، براؤزر کی قسم اور کارٹ و لاگ اِن کے لیے ضروری کوکیز۔

## ہم ڈیٹا کیسے استعمال کرتے ہیں
- آرڈر مکمل کرنے، پہنچانے اور ٹیکس انوائس جاری کرنے کے لیے۔
- آرڈر کے بارے میں ای میل، ایس ایم ایس یا واٹس ایپ پر رابطے کے لیے۔
- قانونی تقاضے پورے کرنے کے لیے، بشمول ZATCA کے تقاضے۔
- مارکیٹنگ پیغامات صرف آپ کی اجازت سے۔ آپ کسی بھی وقت اَن سبسکرائب کر سکتے ہیں۔

## ادائیگی کا ڈیٹا
آن لائن ادائیگی لائسنس یافتہ پیمنٹ سروس فراہم کنندہ کے محفوظ صفحے پر ہوتی ہے۔ ہم کارڈ نمبر یا سیکیورٹی کوڈ اپنے سرورز پر محفوظ نہیں کرتے۔

## ڈیٹا کا اشتراک
ہم صرف آرڈر مکمل کرنے کے لیے کم سے کم ضروری ڈیٹا کورئیر، پیمنٹ فراہم کنندہ اور میسجنگ سروسز کے ساتھ شیئر کرتے ہیں۔ ہم آپ کا ڈیٹا فروخت نہیں کرتے۔

## آپ کے حقوق
آپ «ہم سے رابطہ کریں» صفحے کے ذریعے اپنے ڈیٹا تک رسائی، تصحیح یا حذف کی درخواست کر سکتے ہیں۔ انوائس کا ریکارڈ ٹیکس قوانین کے مطابق مدت تک محفوظ رکھا جاتا ہے۔`,
    ],
  },
  {
    slug: "terms",
    title: ["الشروط والأحكام", "Terms & Conditions", "شرائط و ضوابط"],
    body: [
`باستخدامك لمتجر شركة جناح الريادة وإتمامك لأي طلب فإنك توافق على الشروط التالية.

## الطلبات والأسعار
- جميع الأسعار بالريال السعودي وتشمل ضريبة القيمة المضافة.
- يُعد الطلب مؤكدًا بعد استلامك رسالة تأكيد الطلب. يحق لنا إلغاء الطلب في حال خطأ ظاهر في السعر أو عدم توفر المخزون، مع إعادة أي مبلغ مدفوع كاملًا.
- الكميات المعروضة مرتبطة بالمخزون الفعلي وقت إتمام الطلب.

## الدفع
تتوفر طرق الدفع الظاهرة في صفحة إتمام الطلب. في الدفع الإلكتروني يُحجز المخزون لمدة محدودة حتى إتمام عملية الدفع، ويُلغى الطلب تلقائيًا إذا لم يكتمل الدفع.

## استخدام المنتجات
المنتجات الكهربائية يجب أن تُركّب على يد كهربائي مؤهل ووفق كود البناء السعودي. لا نتحمل مسؤولية الأضرار الناتجة عن التركيب الخاطئ أو استخدام المنتج في غير ما صُمم له.

## الضمان
يخضع كل منتج لمدة الضمان المذكورة في صفحته، ويغطي عيوب التصنيع فقط.

## الحساب
أنت مسؤول عن سرّية بيانات الدخول إلى حسابك وعن جميع العمليات التي تتم من خلاله.

## النظام الحاكم
تخضع هذه الشروط لأنظمة المملكة العربية السعودية، ومنها نظام التجارة الإلكترونية.`,
`By using the Janah Al Riyada Co. store and placing an order you agree to the following terms.

## Orders and prices
- All prices are in Saudi Riyals and include VAT.
- An order is confirmed once you receive the order confirmation message. We may cancel an order in case of an obvious pricing error or unavailable stock, with a full refund of any amount paid.
- Quantities shown reflect actual stock at the time the order is placed.

## Payment
The payment methods shown at checkout are available. For online payment, stock is reserved for a limited time until payment completes; the order is cancelled automatically if payment is not completed.

## Using the products
Electrical products must be installed by a qualified electrician in line with the Saudi Building Code. We are not liable for damage caused by incorrect installation or use outside the product's intended purpose.

## Warranty
Each product carries the warranty period stated on its page, covering manufacturing defects only.

## Your account
You are responsible for keeping your sign-in details confidential and for all activity under your account.

## Governing law
These terms are governed by the laws of the Kingdom of Saudi Arabia, including the E-Commerce Law.`,
`جناح الریادہ کمپنی کا اسٹور استعمال کرنے اور آرڈر دینے سے آپ درج ذیل شرائط سے اتفاق کرتے ہیں۔

## آرڈر اور قیمتیں
- تمام قیمتیں سعودی ریال میں ہیں اور ان میں VAT شامل ہے۔
- آرڈر کی تصدیق کا پیغام موصول ہونے پر آرڈر کنفرم سمجھا جاتا ہے۔ قیمت کی واضح غلطی یا اسٹاک نہ ہونے کی صورت میں ہم آرڈر منسوخ کر سکتے ہیں اور ادا شدہ رقم مکمل واپس کریں گے۔
- دکھائی گئی مقدار آرڈر کے وقت کے اصل اسٹاک کے مطابق ہے۔

## ادائیگی
چیک آؤٹ پر دکھائے گئے طریقے دستیاب ہیں۔ آن لائن ادائیگی میں اسٹاک محدود وقت کے لیے محفوظ رہتا ہے؛ ادائیگی مکمل نہ ہونے پر آرڈر خودکار طور پر منسوخ ہو جاتا ہے۔

## مصنوعات کا استعمال
برقی مصنوعات کی تنصیب مستند الیکٹریشن سے سعودی بلڈنگ کوڈ کے مطابق ہونی چاہیے۔ غلط تنصیب یا غلط استعمال سے ہونے والے نقصان کے ہم ذمہ دار نہیں۔

## وارنٹی
ہر پروڈکٹ پر اس کے صفحے پر درج مدت کی وارنٹی ہے جو صرف مینوفیکچرنگ نقائص کا احاطہ کرتی ہے۔

## آپ کا اکاؤنٹ
اپنے لاگ اِن کی تفصیلات خفیہ رکھنا اور اکاؤنٹ سے ہونے والی تمام سرگرمی آپ کی ذمہ داری ہے۔

## قابلِ اطلاق قانون
یہ شرائط مملکتِ سعودی عرب کے قوانین، بشمول ای کامرس قانون، کے تابع ہیں۔`,
    ],
  },
  {
    slug: "returns",
    title: ["سياسة الاسترجاع والاسترداد", "Return & Refund Policy", "واپسی اور رقم کی واپسی کی پالیسی"],
    body: [
`نريدك أن تكون راضيًا عن مشترياتك. إذا لم يناسبك المنتج يمكنك إرجاعه وفق الشروط التالية.

## مدة الإرجاع
يمكنك طلب الإرجاع خلال 7 أيام من تاريخ استلام الطلب.

## شروط الإرجاع
- أن يكون المنتج غير مستخدم وغير مركّب وبحالته الأصلية وفي عبوته مع جميع ملحقاته.
- لا تُقبل إعادة الأسلاك والكابلات المقطوعة حسب الطلب أو المنتجات التي تم تركيبها.
- المنتجات المعيبة أو التي وصلت تالفة تُستبدل أو يُسترد ثمنها كاملًا مع تحمّلنا تكلفة الشحن.

## طريقة طلب الإرجاع
ادخل إلى صفحة الطلب من حسابك أو من رابط تتبّع الطلب واضغط «طلب إرجاع»، ثم اختر المنتجات واذكر السبب. سنتواصل معك لترتيب الاستلام.

## استرداد المبلغ
بعد استلام المنتج وفحصه يُعاد المبلغ بنفس وسيلة الدفع خلال 5 إلى 14 يوم عمل حسب البنك، وتصدر إشعار دائن بالمبلغ المسترد. رسوم التوصيل لا تُسترد إلا إذا كان الإرجاع بسبب عيب أو خطأ منا.

## إلغاء الطلب
يمكنك إلغاء الطلب من صفحة الطلب ما دام لم يدخل مرحلة التجهيز.`,
`We want you to be happy with your purchase. If a product is not right for you, you can return it under the following conditions.

## Return window
You can request a return within 7 days of receiving your order.

## Conditions
- The product must be unused, not installed, in its original condition and packaging with all accessories.
- Wires and cables cut to order, and products that have been installed, cannot be returned.
- Defective items or items damaged in transit are replaced or refunded in full, and we cover the shipping cost.

## How to request a return
Open the order page from your account or your order tracking link, choose "Request a return", select the items and give the reason. We will contact you to arrange collection.

## Refunds
Once the item is received and inspected, the refund is made to the original payment method within 5–14 working days depending on your bank, and a credit note is issued for the refunded amount. Delivery fees are refunded only when the return is due to a defect or our error.

## Cancelling an order
You can cancel from the order page as long as the order has not entered processing.`,
`ہم چاہتے ہیں کہ آپ اپنی خریداری سے مطمئن ہوں۔ اگر پروڈکٹ آپ کے لیے موزوں نہیں تو درج ذیل شرائط کے تحت واپس کی جا سکتی ہے۔

## واپسی کی مدت
آرڈر وصول ہونے کے 7 دن کے اندر واپسی کی درخواست دی جا سکتی ہے۔

## شرائط
- پروڈکٹ غیر استعمال شدہ، غیر نصب شدہ، اصل حالت اور پیکنگ میں تمام لوازمات کے ساتھ ہو۔
- آرڈر پر کاٹی گئی تاریں اور کیبلز، اور نصب شدہ مصنوعات واپس نہیں ہو سکتیں۔
- خراب یا راستے میں ٹوٹی ہوئی اشیاء تبدیل کی جائیں گی یا پوری رقم واپس ہوگی، اور شپنگ کا خرچ ہمارے ذمے ہوگا۔

## واپسی کی درخواست کیسے دیں
اپنے اکاؤنٹ یا آرڈر ٹریکنگ لنک سے آرڈر کا صفحہ کھولیں، «واپسی کی درخواست» منتخب کریں، اشیاء چنیں اور وجہ لکھیں۔ ہم وصولی کے انتظام کے لیے آپ سے رابطہ کریں گے۔

## رقم کی واپسی
پروڈکٹ موصول اور چیک ہونے کے بعد رقم اصل طریقۂ ادائیگی پر 5 سے 14 کاروباری دنوں میں واپس کی جاتی ہے اور کریڈٹ نوٹ جاری ہوتا ہے۔ ڈیلیوری فیس صرف خرابی یا ہماری غلطی کی صورت میں واپس ہوتی ہے۔

## آرڈر کی منسوخی
جب تک آرڈر تیاری کے مرحلے میں داخل نہ ہو، آپ آرڈر کے صفحے سے اسے منسوخ کر سکتے ہیں۔`,
    ],
  },
  {
    slug: "shipping",
    title: ["سياسة الشحن والتوصيل", "Shipping Policy", "شپنگ پالیسی"],
    body: [
`نوصّل إلى جميع مناطق المملكة العربية السعودية.

## طرق التوصيل
- توصيل عادي: من يومين إلى خمسة أيام عمل.
- توصيل سريع: من يوم إلى يومي عمل للمدن الرئيسية.
- استلام من المعرض: متى كان متاحًا لمدينتك.

تظهر الطرق المتاحة لمدينتك مع الرسوم والموعد المتوقع في خطوة «طريقة التوصيل» عند إتمام الطلب.

## رسوم التوصيل
تُحتسب الرسوم حسب المدينة وطريقة التوصيل وتظهر قبل تأكيد الطلب. يكون التوصيل العادي مجانيًا للطلبات التي تتجاوز الحد الموضّح في السلة.

## تتبّع الطلب
عند شحن طلبك نرسل لك رقم التتبع، ويمكنك متابعة حالة الطلب من صفحة «تتبّع الطلب» أو من حسابك.

## استلام الشحنة
يُرجى فحص الشحنة عند الاستلام. إذا وصل المنتج تالفًا أو ناقصًا تواصل معنا خلال 48 ساعة لمعالجة الأمر.

## التأخير
قد تتأخر الشحنات في المواسم والعطل الرسمية أو لظروف خارجة عن إرادتنا، وسنبلغك بأي تأخير.`,
`We deliver to every region of Saudi Arabia.

## Delivery methods
- Standard delivery: 2–5 working days.
- Express delivery: 1–2 working days to major cities.
- Pick up from the shop: where available for your city.

The methods available for your city, with the fee and expected date, are shown at the delivery method step of checkout.

## Delivery fees
Fees depend on the city and delivery method and are shown before you confirm the order. Standard delivery is free for orders above the threshold shown in your cart.

## Tracking
When your order ships we send you a tracking number. You can follow the order on the Track order page or in your account.

## Receiving your shipment
Please inspect the shipment on delivery. If an item arrives damaged or missing, contact us within 48 hours so we can put it right.

## Delays
Deliveries may take longer during peak seasons and public holidays or for reasons outside our control. We will let you know of any delay.`,
`ہم سعودی عرب کے تمام علاقوں میں ڈیلیوری کرتے ہیں۔

## ڈیلیوری کے طریقے
- عام ڈیلیوری: 2 سے 5 کاروباری دن۔
- ایکسپریس ڈیلیوری: بڑے شہروں میں 1 سے 2 کاروباری دن۔
- دکان سے وصولی: جہاں آپ کے شہر میں دستیاب ہو۔

آپ کے شہر کے لیے دستیاب طریقے، فیس اور متوقع تاریخ چیک آؤٹ کے «ڈیلیوری کا طریقہ» مرحلے پر دکھائے جاتے ہیں۔

## ڈیلیوری فیس
فیس شہر اور طریقے کے مطابق ہوتی ہے اور آرڈر کی تصدیق سے پہلے دکھائی جاتی ہے۔ کارٹ میں دکھائی گئی حد سے زیادہ کے آرڈر پر عام ڈیلیوری مفت ہے۔

## ٹریکنگ
آرڈر روانہ ہونے پر ہم آپ کو ٹریکنگ نمبر بھیجتے ہیں۔ آپ «آرڈر ٹریک کریں» صفحے یا اپنے اکاؤنٹ سے صورتحال دیکھ سکتے ہیں۔

## شپمنٹ کی وصولی
براہِ کرم وصولی پر شپمنٹ چیک کریں۔ اگر کوئی چیز خراب یا کم ہو تو 48 گھنٹوں کے اندر ہم سے رابطہ کریں۔

## تاخیر
مصروف سیزن، سرکاری تعطیلات یا ہمارے اختیار سے باہر وجوہات کی بنا پر تاخیر ہو سکتی ہے۔ ہم آپ کو کسی بھی تاخیر سے آگاہ کریں گے۔`,
    ],
  },
  {
    slug: "vat",
    title: ["معلومات ضريبة القيمة المضافة", "VAT & Tax Information", "VAT اور ٹیکس کی معلومات"],
    body: [
`## الأسعار تشمل الضريبة
جميع الأسعار المعروضة في المتجر تشمل ضريبة القيمة المضافة بنسبة 15% وفق أنظمة هيئة الزكاة والضريبة والجمارك.

## الفاتورة الضريبية
تصدر لكل طلب فاتورة ضريبية إلكترونية تتضمن اسم المنشأة والرقم الضريبي ورقم الفاتورة وتاريخها وتفاصيل المنتجات والمبلغ قبل الضريبة ومبلغ الضريبة والإجمالي، مع رمز الاستجابة السريعة. يمكنك عرضها وطباعتها من صفحة الطلب.

## فواتير المنشآت
إذا كنت تشتري باسم منشأة مسجّلة في ضريبة القيمة المضافة، أدخل اسم المنشأة ورقمها الضريبي (15 رقمًا) في خطوة بيانات العميل لتصدر الفاتورة الضريبية باسم المنشأة.

## الاسترداد والإشعارات الدائنة
عند استرداد مبلغ طلب كليًا أو جزئيًا يصدر إشعار دائن مرتبط بالفاتورة الأصلية.

بيانات المنشأة ورقمها الضريبي مذكورة أسفل كل صفحة وفي كل فاتورة.`,
`## Prices include VAT
All prices shown in the store include Value Added Tax at 15%, in line with ZATCA regulations.

## Tax invoice
An electronic tax invoice is issued for every order. It shows the seller's name and VAT number, invoice number and date, product details, the amount before VAT, the VAT amount and the total, together with a QR code. You can view and print it from the order page.

## Business invoices
If you are buying for a VAT-registered business, enter the company name and its 15-digit VAT number at the customer details step so the tax invoice is issued in the company's name.

## Refunds and credit notes
When an order is refunded in full or in part, a credit note linked to the original invoice is issued.

The company details and VAT number appear at the bottom of every page and on every invoice.`,
`## قیمتوں میں VAT شامل ہے
اسٹور میں دکھائی گئی تمام قیمتوں میں ZATCA کے ضوابط کے مطابق 15٪ ویلیو ایڈڈ ٹیکس شامل ہے۔

## ٹیکس انوائس
ہر آرڈر کے لیے الیکٹرانک ٹیکس انوائس جاری ہوتی ہے جس میں فروخت کنندہ کا نام اور VAT نمبر، انوائس نمبر اور تاریخ، مصنوعات کی تفصیل، VAT سے پہلے کی رقم، VAT کی رقم اور کل رقم QR کوڈ کے ساتھ درج ہوتی ہے۔ آپ اسے آرڈر کے صفحے سے دیکھ اور پرنٹ کر سکتے ہیں۔

## اداروں کی انوائس
اگر آپ VAT میں رجسٹرڈ ادارے کے لیے خرید رہے ہیں تو کسٹمر کی تفصیلات کے مرحلے پر کمپنی کا نام اور 15 ہندسوں کا VAT نمبر درج کریں تاکہ انوائس کمپنی کے نام پر جاری ہو۔

## رقم کی واپسی اور کریڈٹ نوٹ
جب کسی آرڈر کی رقم مکمل یا جزوی طور پر واپس کی جاتی ہے تو اصل انوائس سے منسلک کریڈٹ نوٹ جاری ہوتا ہے۔

کمپنی کی تفصیلات اور VAT نمبر ہر صفحے کے نیچے اور ہر انوائس پر درج ہیں۔`,
    ],
  },
];
