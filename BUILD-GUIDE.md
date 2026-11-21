# Janah Al Riyadah — Customer App + Owner App
### Build aur setup guide (Android Studio)

Is project se **do alag apps** banti hain:

| App | Package name | Kis ke liye |
|---|---|---|
| **Janah Al Riyadah** (Customer) | `com.janahalriyadah.store` | Customers: products dekhna, cart, order, payment, order tracking, repair booking |
| **Janah Owner** (Owner) | `com.janahalriyadah.owner` | Aap: products add karna, inventory, orders confirm karna, payment details, checkout form, repair requests |

Dono apps mein upar **🌐 English / العربية** button hai (Arabic mein poori app right‑to‑left ho jaati hai).

---

## Step 1 — Firebase set up karein (10 minute)

1. https://console.firebase.google.com par **akrambajwa062@gmail.com** se sign in karein.
2. **Add project** → naam: `janah-al-riyadah` → Create.
3. Project ke andar **Web app (`</>`)** add karein → naam `janah` → **Register app**.
   Jo `firebaseConfig` dikhe, uski values copy karein.
4. Android Studio mein yeh file kholein:
   `android/app/src/main/assets/www/config.js`
   aur values paste karein:
   ```js
   firebase: {
     apiKey: "AIza....",
     authDomain: "janah-al-riyadah.firebaseapp.com",
     projectId: "janah-al-riyadah",
     storageBucket: "janah-al-riyadah.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   },
   ownerEmails: ["akrambajwa062@gmail.com"]
   ```
   > `apiKey` khali chhorein to app **Demo mode** mein chalti hai (data sirf usi phone par).
5. **Build → Authentication → Get started → Email/Password → Enable → Save.**
6. **Authentication → Users → Add user**: email `akrambajwa062@gmail.com` + apna password.
   ⚠️ Yeh sab se pehle karein — yahi Owner app ka login hai. (Customers apna account app se khud banate hain.)
7. **Build → Firestore Database → Create database** → Production mode → location: Saudi ke qareeb wali (`me-central2 (Dammam)` agar list mein ho, warna koi Europe region).
8. Firestore → **Rules** tab → is project ki file `firestore.rules` ka poora text paste karein → **Publish**.

Bas. Product images aur payment receipts compress ho kar Firestore mein save hoti hain, is liye **Firebase Storage ya paid (Blaze) plan ki zaroorat nahi** — free Spark plan kaafi hai.

---

## Step 2 — APK banana (Android Studio)

1. Android Studio → **File → Open** → `android` folder select karein → Gradle sync hone dein (pehli baar internet se downloads honge).
   Agar "Upgrade Android Gradle Plugin" ka message aaye to **Upgrade** kar sakte hain.
2. Left side **Build Variants** panel kholein (View → Tool Windows → Build Variants).

### Debug APK (testing ke liye)
- Variant **customerDebug** select karein → **Build → Build App Bundle(s) / APK(s) → Build APK(s)**
- Variant **ownerDebug** select karein → dobara **Build APK(s)**
- Files yahan milengi:
  - `app/build/outputs/apk/customer/debug/app-customer-debug.apk`
  - `app/build/outputs/apk/owner/debug/app-owner-debug.apk`
- Debug apps ka package `.debug` par khatam hota hai, is liye debug aur release dono ek hi phone par saath install ho sakti hain.

### Release APK (signed)
1. **Build → Generate Signed App Bundle or APK → APK → Next**
2. **Create new…** keystore banayein (misal: `janah-release.jks`), password aur alias `janah` rakhein.
   ⚠️ **Yeh .jks file aur passwords hamesha sambhal kar rakhein** (Google Drive + USB). Iske baghair aap Play Store par app update nahi kar sakenge.
3. Variants: **customerRelease** aur **ownerRelease** dono select karein → **Create**.
4. Files:
   - `app/build/outputs/apk/customer/release/app-customer-release.apk`
   - `app/build/outputs/apk/owner/release/app-owner-release.apk`

### Command line (optional)
`android` folder mein `keystore.properties` banayein:
```
storeFile=janah-release.jks
storePassword=YOUR_PASSWORD
keyAlias=janah
keyPassword=YOUR_PASSWORD
```
phir:
```
gradlew assembleCustomerDebug assembleOwnerDebug
gradlew assembleCustomerRelease assembleOwnerRelease
gradlew bundleCustomerRelease        (Play Store ke liye .aab)
```

---

## Step 3 — Google Play Store par upload

- ⚠️ Play Store **naye apps ke liye APK qubool nahi karta — `.aab` (Android App Bundle) chahiye.** Wahi wizard use karein lekin **Android App Bundle** chunein → `customerRelease`.
  File: `app/build/outputs/bundle/customerRelease/app-customer-release.aab`
- App already **targetSdk 36 (Android 16)** par hai, jo Play ki maujooda shart hai.
- Play Console mein zaroori cheezein: privacy policy ka link, Data safety form (naam, phone, email, address, order history collect hoti hai), app icon 512×512 (`store-assets/` folder mein diya hua hai), kam az kam 2 screenshots.
- **Owner app** ko Play Store par public na karein — `app-owner-release.apk` seedha apne phone par install karein (ya Play Console ki "Internal testing" track use karein).

---

## Step 4 — Owner app mein pehli setting

Owner app kholein → login (`akrambajwa062@gmail.com`) → **⚙️ Settings**:

- **💳 Payment methods** — yahan jo bharenge, woh customer ke checkout form mein nazar aata hai:
  - **Cash on delivery** — on/off + instructions
  - **Bank transfer** — Bank name, account name, **IBAN (SA… 24 characters)**. Customer IBAN copy karke transfer karta hai, reference number + receipt ki photo upload karta hai. Aapko order mein receipt dikhti hai → **Mark as paid**.
  - **STC Pay** — aapka STC Pay number; customer transaction number bharta hai.
  - **Mada / Visa / Mastercard (online)** — https://moyasar.com par merchant account banayein → dashboard se **publishable key** (`pk_live_…`) yahan paste karein. ⚠️ Secret key (`sk_…`) kabhi app mein na daalein — app use reject kar deti hai.
- **📝 Checkout form fields** — apne sawal add karein (misal: "Building type", "Delivery time"), English + Arabic label, required ya optional. Yeh fauran customer app ke checkout form mein aa jaate hain.
- **🏪 Store details** — naam, phone, WhatsApp, address, VAT number, delivery fee, free delivery limit.
- **🗂️ Categories** — product categories (English + Arabic).

Phir **🏷️ Products → + Add** se products (photo, Arabic/English naam, price, stock) daalein.

### Order ka flow
1. Customer order karta hai → Owner app mein 🔔 alert + **Pending** list.
2. **✅ Confirm order** dabate hi stock khud kam ho jaata hai (agar stock kam ho to app rok deti hai).
3. **Preparing → Out for delivery → Delivered** — customer ko apni app mein har step nazar aata hai.
4. Cancel karne par (confirm ke baad) stock wapas add ho jaata hai.
5. Customer ko call / WhatsApp / Google Maps ek tap se.

---

## Kuch zaroori baatein

- **Prices VAT (15%) ke saath** hain (setting se badal sakte hain); checkout par VAT alag dikhaya jaata hai.
- **Card payment** ke baad app order ko "Paid" mark karti hai — maal bhejne se pehle Moyasar dashboard mein payment ID check kar lein (yeh order mein dikhti hai). Mukammal automatic verification ke liye Firebase Cloud Function (Blaze plan) chahiye — baad mein add ho sakta hai.
- **Push notifications** (app band ho tab bhi alert) is version mein nahi; Owner app khuli ho to naya order aate hi awaaz + vibration hoti hai.
- App ka design/code badalna ho: `web/src/` mein files hain → `web` folder mein `npm install` aur `node build.mjs` chalayein → Android Studio se dobara build.

## Folder structure
```
janah-al-riyadah/
├── android/            ← Android Studio isko open karein
│   └── app/src/
│       ├── main/       ← MainActivity.java, config.js (Firebase), styles, fonts
│       ├── customer/   ← Customer app (naam, icon, screens)
│       └── owner/      ← Owner app (naam, icon, screens)
├── web/                ← App screens ka source code (JavaScript)
├── firestore.rules     ← Firebase security rules
├── store-assets/       ← 512×512 icons for Play Store
└── BUILD-GUIDE.md      ← yeh file
```
