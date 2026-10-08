# Publishing the apps: Google Play, App Store, Windows

All three apps open the live store at **https://janah-alriyadah-store.onrender.com**. GitHub builds them,
and they show whatever the website shows, so changes to products, prices or pages need no app update.

Listing an app in a store has to be done from the shop's own developer accounts. Those accounts carry the
company's identity, its payment details and the legal agreements with Google and Apple. Everything else is
prepared in this repository:

| | Google Play | Apple App Store | Windows |
|---|---|---|---|
| App | `android/`, built by *Actions → Android app* | `ios/`, built by *Actions → iOS app* (no Mac needed) | `desktop/`, built by *Actions → Windows app* |
| File | `.aab` signed with the upload key | uploaded to App Store Connect by the build | `janah-alriyadah-setup-<v>.exe` under Releases |
| Account | Google Play Console, US$25 once | Apple Developer Program, US$99 a year | none needed to share the .exe |
| Listing texts | `store/google-play/listing/` (ar, en-US, ur) | `store/app-store/listing/` (ar-SA, en-US) | — |
| Graphics | `store/google-play/` | screenshots in each `ios-build-N` release | — |
| Time to go live | a few days for review; 14+ days for a new personal account (testing rule below) | 1–3 days for review | immediately |

- [Before any store](#before-any-store)
- [Google Play](#google-play)
- [Apple App Store](#apple-app-store)
- [Windows](#windows)
- [Updating the apps later](#updating-the-apps-later)
- [Keys to keep safe](#keys-to-keep-safe)

## Before any store

1. **The website must be live.** Both stores test the app against it. On Render, add a payment card under
   Billing, then deploy (see [DEPLOYMENT.md](DEPLOYMENT.md)).
2. **Admin → Settings → Store:** legal name, phone, WhatsApp, e-mail, VAT and CR numbers, address.
   Reviewers look for working contact details.
3. **Admin → Pages:** have the privacy policy, terms and returns pages reviewed. The stores link to the
   privacy policy: `https://janah-alriyadah-store.onrender.com/ar/page/privacy`.
4. **Replace the sample catalogue** with real products and photos, then retake the screenshots (below).
5. **Register as an organisation, not an individual**, on both stores. You need a D-U-N-S number for the
   company (free from Dun & Bradstreet, takes a few days). Both stores then show the company, not a person,
   as the seller, and Google's 12-tester rule (below) applies only to personal accounts.
6. **Online payments in the listing:** the texts mention cash on delivery only. When Moyasar is switched on,
   add a line such as "Pay by mada, Visa or Mastercard". Physical goods are paid through your own checkout,
   so neither store's in-app purchase system is involved.

## Google Play

**Ready:** the app bundle (`janah-alriyadah-<version>-play.aab`, signed with the upload key), package
`sa.janah.store`, targeting Android 16 (API level 36), which Google Play has required for new apps since
31 August 2026. Also ready: listing texts in Arabic, English and Urdu, the feature graphic, the 512 px icon,
phone screenshots, and account deletion inside the app (Account → Delete account).

### Steps

1. **Developer account:** <https://play.google.com/console>. Choose *Organisation*, pay the fee, and
   complete identity verification.
2. **Create app:** name `جناح الريادة للكهربائيات`, default language Arabic, *App*, *Free*.
3. **Set up your app** (Dashboard), using the answers below:
   - Privacy policy: `https://janah-alriyadah-store.onrender.com/ar/page/privacy`
   - App access: *All functionality is available without special access*. Browsing and guest checkout need
     no account, and reviewers can create one from Sign in.
   - Ads: *No*.
   - Content rating: see [the answers](#content-rating-questionnaire).
   - Target audience: *18 and over*.
   - Data safety: see [the answers](#data-safety-form).
   - News app: *No*. Government app: *No*. Financial features: *None*. Health: *No*.
4. **Main store listing:** paste `title.txt`, `short-description.txt` and `full-description.txt` from
   `store/google-play/listing/ar`. Add English (`en-US`) and Urdu (`ur`) under *Translations*. Upload
   `app-icon-512.png`, `feature-graphic-1024x500.png` and the phone screenshots (`phone-ar/`, `phone-en/`).
   Category: *Shopping*. Contact e-mail: the shop's.
5. **Testing.** A *personal* account created after November 2023 must first run a **closed test with at
   least 12 testers who stay opted in for 14 days in a row**. Only then can you apply for production. An
   organisation account can release to production straight away. Starting with *Internal testing* (up to
   100 testers, no review wait) is a good way to try the app on staff phones either way.
6. **Create the release:** upload the `.aab`. Accept **Play App Signing**: Google keeps the final signing key
   and you keep the upload key. Release notes, for example: `الإصدار الأول من تطبيق متجر جناح الريادة`.
7. **Remove the address bar.** After the first upload, open *Test and release → App integrity → App
   signing*. Copy the **App signing key certificate SHA-256** and set it on the server (Render → Environment)
   together with the upload key's fingerprint:
   ```ini
   ANDROID_APP_PACKAGE=sa.janah.store
   ANDROID_APP_SHA256=<App signing key SHA-256>,34:79:81:A7:FC:11:2A:A6:9C:8D:5E:22:59:C0:2D:62:F6:F6:88:66:1D:AA:77:9E:78:3C:F6:A3:9C:B1:6F:8F
   ```
   `/.well-known/assetlinks.json` then proves the app and the site belong together, and the app opens without
   Chrome's address bar.
8. **Automatic updates (optional).** Add these repository secrets (GitHub → Settings → Secrets and
   variables → Actions):
   - `ANDROID_KEYSTORE_BASE64`: the upload key file, base64-encoded (`base64 -w0 janah-upload-key.jks`, or in
     PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes("janah-upload-key.jks"))`)
   - `ANDROID_KEYSTORE_PASSWORD`: its password
   - `PLAY_SERVICE_ACCOUNT_JSON`: the JSON key of a Google Cloud service account. Invite it in Play Console →
     *Users and permissions* with permission to release to testing tracks.

   Every Android build is then signed with the upload key and arrives in the Play Console as a draft release
   on *Internal testing*. You review it there and promote it to production.

### Data safety form

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS only) |
| Do you provide a way for users to request that their data is deleted? | Yes: in the app (Account → Delete account), or by contacting the shop |
| Data shared with third parties | None. Delivery and payment companies act on the shop's behalf, which Google doesn't count as sharing. |

Data collected (each: collected, not shared, not ephemeral):

| Data type | Required? | Purposes |
|---|---|---|
| Personal info → Name | Required to order | App functionality, Account management |
| Personal info → Email address | Required for an account | App functionality, Account management |
| Personal info → Phone number | Required to order | App functionality (delivery) |
| Personal info → Address | Required for delivery | App functionality |
| Financial info → Purchase history | Required | App functionality |
| Messages → Other in-app messages | Optional (Contact us form) | Customer support |
| App activity → Other user-generated content | Optional (product reviews) | App functionality |

Card details: when Moyasar is enabled, customers type them on Moyasar's payment page. They never reach the
shop's server, and the app doesn't collect them.

### Content rating questionnaire

Category: **All other app types**. Answer *No* to violence, fear, sexuality, gambling, language, controlled
substances and crude humour. Interactive elements:

- Users can interact or exchange content: **Yes**. Product reviews are shown to other customers once staff
  approve them.
- Shares the user's location with other users: **No**.
- Purchases of digital goods: **No**. Only physical goods are sold.

Expected rating: everyone / 3+, with "Users Interact".

## Apple App Store

**Ready:** the iPhone and iPad app in `ios/`. It isn't only a web page in a frame. It has native loading,
offline and error screens in Arabic, English and Urdu, the iOS print sheet for tax invoices (print or save
as PDF), downloads to Files through the share sheet, and swipe-to-go-back and pull-to-refresh. Phone, e-mail,
WhatsApp and map links open in their own apps, and other sites open in an in-app Safari sheet. It also has a
privacy manifest and account deletion. Each run of *Actions → iOS app*:

- compiles it on GitHub's Mac servers;
- opens it against a local copy of the store in an iPhone 6.9" and an iPad 13" simulator, and checks it
  starts and keeps running on every page;
- publishes the screenshots at the sizes App Store Connect asks for, as the pre-release `ios-build-N`;
- once the Apple secrets exist, signs the app and uploads it to App Store Connect (TestFlight).

Listing texts are in Arabic (`ar-SA`) and English (`en-US`). The App Store has no Urdu listing language.
Urdu-speaking customers see the English listing, and the app itself follows their phone's language.

### Steps

1. **Apple Developer Program:** <https://developer.apple.com/programs/enroll/>. Enrol as an
   *Organisation* with the D-U-N-S number.
2. **App ID:** Certificates, Identifiers & Profiles → Identifiers → + → App IDs → App. Description
   `Janah Al Riyada`, explicit Bundle ID `sa.janah.store`. No extra capabilities.
3. **App record:** App Store Connect → Apps → + → New App. Platform iOS, name
   `جناح الريادة للكهربائيات`, primary language Arabic, bundle ID `sa.janah.store`, SKU `janah-store`.
4. **API key for the build:** App Store Connect → Users and Access → Integrations → App Store Connect API →
   Team Keys → +. Choose access **Admin**, which lets the build create the distribution certificate.
   Download the `.p8` file (it can be downloaded only once), and note the *Key ID* and the *Issuer ID*.
5. **GitHub secrets** (Settings → Secrets and variables → Actions):
   - `APPLE_TEAM_ID`: Team ID (developer.apple.com → Account → Membership details)
   - `ASC_KEY_ID`, `ASC_ISSUER_ID`
   - `ASC_KEY_P8_BASE64`: the `.p8` file, base64-encoded (`base64 -i AuthKey_XXXX.p8` on a Mac, or in
     PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXX.p8"))`)
6. **Build and upload:** Actions → iOS app → Run workflow. After about 15–30 minutes of Apple processing,
   the build appears under *TestFlight*. Install the TestFlight app on an iPhone to try it before release.
7. **App information:** category *Shopping*. Age rating questionnaire: *None* for every content question,
   and *Yes* for user-generated content (reviews, moderated). Privacy policy URL:
   `https://janah-alriyadah-store.onrender.com/ar/page/privacy`.
8. **App Privacy:** *Data is collected*, not used for tracking, all *linked to the user's identity*,
   purpose *App Functionality*:
   - Contact Info: Name, Email Address, Phone Number, Physical Address
   - Purchases: Purchase History
   - User Content: Customer Support (Contact us form), Other User Content (reviews)

   This matches the app's privacy manifest (`ios/JanahStore/PrivacyInfo.xcprivacy`).
9. **Version page:**
   - Screenshots: download `app-store-screenshots-iphone.zip` and `app-store-screenshots-ipad.zip` from the
     newest `ios-build-N` release. Upload the iPhone set to *iPhone 6.9" Display* and the iPad set to
     *iPad 13" Display*.
   - Paste `name`, `subtitle`, `promotional-text`, `description` and `keywords`, and the support and
     marketing URLs from `store/app-store/listing/ar-SA`. Add English under the language menu.
   - Build: the one from TestFlight.
   - App Review information: a contact person and phone number. Under *Sign-in required*, create a customer
     account on the live site and enter its e-mail and password, so the reviewer can see orders and account
     deletion. For *Notes*, paste `store/app-store/review-notes.txt`.
10. **Submit for review.**

### If Apple rejects the app under guideline 4.2

Guideline 4.2 (minimum functionality) is the usual reason a store app built on a website gets rejected.
This app's native screens, printing, downloads and link handling are listed in the review notes for that
reason. If Apple still asks for more, the strongest addition is **push notifications for order status**
(confirmed, shipped, delivered). That needs an Apple push key and a small server change, and can be added to
this project.

Meanwhile iPhone and iPad customers can already install the store from Safari (Share → Add to Home Screen),
and the website walks them through it.

## Windows

**Ready:** `janah-alriyadah-setup-<version>.exe` on the repository's Releases page. It installs for the
current user, with no administrator rights. It adds Desktop and Start-menu shortcuts and opens the store in
its own window, with the back office under *Store → Back office*. Every build starts the packaged app on a
Windows server and checks that it opens before publishing.

- **Sharing it:** link to the release, or put the file on the website or in WhatsApp. Windows 10 and 11,
  64-bit.
- **"Windows protected your PC":** the installer isn't code-signed yet, so SmartScreen asks once. Choose
  *More info → Run anyway*. A code-signing certificate removes this, either from Microsoft's Azure signing
  service or from a certificate authority. Once you have one, signing can be added to the build.
- **Microsoft Store (optional):** create a Partner Center account. The quickest route is the web-app
  package from [PWABuilder](https://www.pwabuilder.com): enter the live site, choose Windows, and Microsoft
  signs the package. Submitting the `.exe` itself requires it to be code-signed first.

## Updating the apps later

- **Website changes** (products, prices, pages, design) reach every app straight away. No store update is
  needed.
- **App changes:** every push that touches `android/`, `ios/` or `desktop/` builds new versions. The Android
  version code and the iOS build number count up by themselves. Change the App Store version number
  (`MARKETING_VERSION` in `ios/project.yml`) when you submit a new release to Apple.
- **Own domain:** change `host` in `android/twa.json` (used by both the Android and iPhone builds) and `url`
  in `desktop/config.json`, set `APP_URL` on the server, and let the builds run. Then update the privacy and
  support URLs in both store listings.

## Keys to keep safe

| Key | What it's for | If it's lost |
|---|---|---|
| `janah-upload-key.jks` and its password | Signing every Google Play update | Google Play support can register a new upload key, because Play App Signing holds the real key. Updates stop until then. |
| `AuthKey_XXXX.p8` (App Store Connect API) | The iOS build uploading to Apple | Revoke it and create a new one in App Store Connect |
| Google service-account JSON | The Android build uploading to Play | Create a new key for the service account |

Keep them in a password manager, not in the repository. `.gitignore` already excludes `*.jks`.
