# REST API

Base URL: the site origin (`APP_URL`). All bodies are JSON (`content-type: application/json`)
unless noted. The storefront and the back office are both clients of this API; anything
they do can be done by another client with the same rules.

- [Conventions](#conventions)
- [Authentication and account](#authentication-and-account)
- [Catalogue](#catalogue)
- [Cart](#cart)
- [Checkout](#checkout)
- [Orders, tracking, invoices](#orders-tracking-invoices)
- [Support and content](#support-and-content)
- [Payment gateway callbacks](#payment-gateway-callbacks)
- [Admin API](#admin-api)

## Conventions

**Sessions.** `POST /api/auth/login` sets an `HttpOnly` cookie `sid`. Send cookies with
every request. Sessions last `SESSION_DAYS` and are revoked on password reset or when an
account is disabled.

**CSRF.** Every non-GET request must carry header `x-csrf-token` equal to the value of the
`csrf` cookie. Any GET to the site or API sets that cookie if it is missing. If an `Origin`
header is present it must match `APP_URL`. Violations return `403 {"error":{"code":"csrf"}}`.
The only exception is the payment webhook.

**Language.** Responses are localised (product names, error messages). The language is
taken from header `x-lang: ar|en|ur`, else cookie `lang`, else Arabic.

**Money.** Integers in halalas: `2450` means 24.50 SAR. VAT rates are basis points
(`1500` = 15%). Prices include VAT unless **Settings → Tax** says otherwise.

**Errors.**

```json
{ "error": { "code": "validation", "message": "بعض البيانات تحتاج تصحيحًا…",
             "details": { "fields": { "customer.phone": "invalid_phone", "address.city_id": "required" } } } }
```

| Status | Typical `code` |
|---|---|
| 400 | `invalid_json`, `cart_empty`, `address_required`, `coupon_invalid`, `coupon_expired`, `coupon_min_subtotal`, `shipping_method_unavailable`, `payment_method_unavailable`, `reset_token_invalid`, `invalid_refund_amount`, … |
| 401 | `unauthorized`, `invalid_credentials` |
| 403 | `forbidden` (missing permission), `csrf`, `review_requires_purchase` |
| 404 | `not_found`, `product_not_found`, `order_not_found` |
| 409 | `email_taken`, `out_of_stock`, `insufficient_stock` (`details.available`), `cart_changed`, `invalid_status_transition`, `sku_taken`, … |
| 413 | `payload_too_large`, `file_too_large` |
| 422 | `validation` with `details.fields` (dot-separated path → reason code) |
| 423 | `account_locked` (5 wrong passwords; 15 minutes) |
| 429 | `rate_limited` with `details.retry_after` seconds |
| 502 | `payment_unavailable`, `refund_failed` (gateway did not answer) |

Field reason codes: `required`, `too_short`, `too_long`, `too_small`, `too_big`,
`invalid_email`, `invalid_phone`, `invalid_url`, `invalid_format`, `invalid_choice`,
`invalid_vat_number`, `invalid_postal_code`, `invalid_short_address`, `terms_required`, …

**Rate limits** per IP address per minute: 10 for sign-in, registration, password reset,
contact form and order tracking; 90 for other writes; 180 for search; 900 for other reads.

**Pagination.** List endpoints accept `page` (from 1) and `per`, and return
`{ rows | items, total, page, pages }`.

## Authentication and account

| Method | Path | Body / notes |
|---|---|---|
| POST | `/api/auth/register` | `{name, email, phone, password, marketing_opt_in?}` → `{user}`. Password: 8+ characters with a letter and a digit. Saudi mobiles are normalised to `+9665XXXXXXXX`. Signs the user in and merges the guest cart. |
| POST | `/api/auth/login` | `{email, password}` → `{user}`. `user.kind` is `customer` or `admin`; admins also get `role` and `permissions`. |
| POST | `/api/auth/logout` | Ends the session. |
| GET | `/api/auth/me` | `{user}` or `{user: null}`. |
| POST | `/api/auth/forgot-password` | `{email}` → always `{ok: true}`. E-mails a one-hour, single-use link when the address exists. |
| POST | `/api/auth/reset-password` | `{token, password}`. Revokes all sessions of that user. |
| PATCH | `/api/account/profile` 🔒 | `{name, phone, locale?}` |
| POST | `/api/account/password` 🔒 | `{current, password}` |
| GET | `/api/account/orders` 🔒 | Paginated order history. |
| GET · POST | `/api/account/addresses` 🔒 | List / create. Body: `{label?, recipient_name, phone, city_id, district, street, building_no?, postal_code?, short_address?, notes?, is_default?}`. Up to 20 per customer. |
| PUT · DELETE | `/api/account/addresses/:id` 🔒 | Only the owner's addresses are affected. |
| GET · POST | `/api/account/wishlist` 🔒 | `POST {product_id}` |
| DELETE | `/api/account/wishlist/:productId` 🔒 | |

🔒 = signed-in user required (`401` otherwise).

## Catalogue

| Method | Path | Notes |
|---|---|---|
| GET | `/api/categories` | Category tree with product counts. |
| GET | `/api/brands` | |
| GET | `/api/products` | Listing and search. Query: `q` (name, SKU, barcode, brand, category, keywords in Arabic/English/Urdu, typo-tolerant), `category` (slug, includes subcategories), `brand` (comma-separated slugs), `min`, `max` (SAR), `in_stock=1`, `rating` (minimum stars), `flag` = `featured` \| `new` \| `best` \| `deals`, `sort` = `price_asc` \| `price_desc` \| `newest` \| `popular` \| `rating` (default: relevance, in-stock first), `page`, `per`. Returns `{items, total, page, pages, facets: {brands, price_min, price_max}}`. |
| GET | `/api/search/suggest?q=` | Autocomplete: `{products, categories, brands}`. |
| GET | `/api/products/:slug` | Full product: images, video, specifications, stock state, rating, reviews, related and frequently-bought-together products. |
| GET | `/api/products/by-ids?ids=1,2,3` | Cards for up to 24 ids (recently viewed, wishlist). |
| POST | `/api/products/:id/reviews` 🔒 | `{rating: 1–5, title?, body?}`. One review per customer per product; goes to moderation unless auto-approve is on. |
| GET | `/api/regions` | Regions with their active cities (for address forms). |
| GET | `/api/settings` | Public store details, VAT rate, whether guest checkout and online payment are available. |

A product card:

```json
{ "id": 5, "slug": "13a-single-switched-socket-type-g", "sku": "SK-13A-1G",
  "name": "فيش ثلاثي مفرد 13 أمبير مع مفتاح", "brand": "شنايدر إلكتريك", "image": null,
  "price": 2400, "list_price": 2400, "discount_pct": 0,
  "rating_avg": 0, "rating_count": 0, "is_new": false, "is_best_seller": true,
  "in_stock": true, "low_stock": false }
```

`price` is what the customer pays now (after any scheduled discount); `list_price` is the
regular price.

## Cart

The cart belongs to the signed-in user, or to the browser through the `cart` cookie for
guests. It persists for 60 days and is merged into the account at sign-in.

| Method | Path | Body |
|---|---|---|
| GET | `/api/cart` | → `{cart}` |
| POST | `/api/cart/items` | `{product_id, quantity?}` adds. `409 insufficient_stock` with `details.available` when stock is short. |
| PATCH | `/api/cart/items/:productId` | `{quantity}` sets (0 removes). |
| DELETE | `/api/cart/items/:productId` | |
| POST | `/api/cart/coupon` | `{code}` |
| DELETE | `/api/cart/coupon` | |
| POST | `/api/cart/recover` | `{token}` from an abandoned-cart e-mail link. |

```json
{ "cart": { "items": [ { "item_id": 1, "product_id": 5, "name": "…", "sku": "SK-13A-1G", "quantity": 2,
                         "unit_price": 2400, "list_price": 2400, "line_total": 4800, "available": 320, "issue": null } ],
            "count": 2, "coupon": { "code": "WELCOME10", "valid": true, "error": null, "type": "percent" }, "has_issues": false,
            "totals": { "items_subtotal": 4800, "discount_total": 480, "shipping_fee": null, "cod_fee": 0,
                        "vat_total": 563, "total_excl_vat": 3757, "total": 4320, "free_shipping_applied": false } } }
```

`issue` is `out_of_stock`, `unavailable` or `qty_reduced` when the line no longer matches
stock; such lines are excluded from the totals.

## Checkout

| Method | Path | Body |
|---|---|---|
| POST | `/api/checkout/quote` | `{city_id?, shipping_method_id?, payment_method?, email?}` → cart with delivery fee, the delivery options for that city (fee, free-delivery threshold, expected dates) and the payment methods available. |
| POST | `/api/checkout/place` | See below → `{number, access_key, redirect_url}` |

```json
{ "customer": { "name": "أحمد الحربي", "email": "ahmed@example.com", "phone": "0551234567",
                "company_name": null, "vat_number": null },
  "address": { "city_id": 1, "district": "العليا", "street": "طريق الملك فهد",
               "building_no": "7421", "postal_code": "12211", "short_address": "RRRD2929", "notes": null },
  "address_id": null,
  "save_address": false,
  "shipping_method_id": 1,
  "payment_method": "cod",
  "notes": null,
  "accept_terms": true }
```

- Send either `address` or, for a signed-in customer, `address_id`.
- `payment_method` is `cod` or `online`. `online` is only accepted when a gateway is
  configured; the response then has `redirect_url` (the gateway's hosted page) and the
  order waits in `pending` until the payment is verified.
- A `vat_number` (15 digits, starts and ends with 3) makes the invoice a standard B2B tax invoice.
- Stock is checked and deducted inside one database transaction with row locks; if two
  customers buy the last unit at the same moment, one gets `409 cart_changed`.
- `access_key` lets a guest open the order later: `/{lang}/order/{number}?key={access_key}`.

## Orders, tracking, invoices

Order endpoints answer the signed-in owner, staff with `orders.view`, or anyone
presenting `?key=<access_key>`. Otherwise `404`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/orders/:number` | Items, totals, status history, shipment, invoices, returns, `can_cancel`, `can_return`, and `pay_url` while an online payment is pending. |
| POST | `/api/orders/:number/cancel` | `{reason?}`. Allowed while `pending` or `confirmed`. Returns stock, reverses the invoice with a credit note. |
| POST | `/api/orders/:number/return` | `{reason, items: [{order_item_id, quantity}]}`. Within 7 days of delivery. |
| POST | `/api/orders/:number/reorder` | Adds the order's items to the cart; `skipped` lists product ids that are no longer available. |
| GET | `/api/track` | `?tracking=<number>` or `?number=<order>&contact=<email or phone>` → status timeline without personal details. |
| GET | `/api/invoices/:number` | Invoice with lines, seller/buyer snapshot and `qr_base64` (ZATCA TLV). Same access rule as orders. |

Order statuses: `pending → confirmed → processing → ready_for_shipment → shipped →
out_for_delivery → delivered`, plus `cancelled`, `returned`, `refunded`. Payment statuses:
`unpaid`, `pending`, `paid`, `failed`, `partially_refunded`, `refunded`.

## Support and content

| Method | Path | Body |
|---|---|---|
| POST | `/api/contact` | `{name, email, phone?, subject, message, order_number?}` → opens a support ticket. |
| GET · POST | `/api/account/tickets` 🔒 | `POST {subject, message, order_number?}` |
| GET | `/api/account/tickets/:number` 🔒 | Ticket with its messages. |
| POST | `/api/account/tickets/:number/messages` 🔒 | `{message}` |
| GET | `/api/faqs` | |
| GET | `/api/pages/:slug` | `privacy`, `terms`, `returns`, `shipping`, `vat` or any page created in the back office. |
| GET | `/api/health` | `{ok: true, time}` |

Not JSON: `GET /sitemap.xml`, `GET /robots.txt`, `GET /media/<file>` (uploaded images),
`GET /assets/<file>` (built JS/CSS).

## Payment gateway callbacks

| Method | Path | Notes |
|---|---|---|
| POST | `/api/webhooks/moyasar` | Configure this URL in the Moyasar dashboard. No CSRF token needed. The body is only used to find the payment; the state is re-read from Moyasar with the secret key. |
| GET | `/pay/return?order=&key=` | Where the gateway sends the customer back. Verifies the payment and redirects to the order page. |

## Admin API

All paths start with `/api/admin`, need an admin session, and check the permission shown.
`403 forbidden` when the role lacks it. Every write is recorded in the audit log.

Permissions: `dashboard.view`, `orders.view`, `orders.manage`, `pos.use`, `products.view`,
`products.manage`, `catalog.manage`, `inventory.view`, `inventory.manage`,
`customers.view`, `customers.manage`, `promotions.manage`, `reviews.manage`,
`payments.view`, `payments.refund`, `shipping.manage`, `returns.manage`, `invoices.view`,
`reports.view`, `content.manage`, `settings.manage`, `tickets.manage`, `users.manage`,
`logs.view`. The `super_admin` role holds `*`.

### Orders, payments, returns, invoices

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/orders` | orders.view | Filters: `q`, `status`, `payment_status`, `channel` (`web`/`pos`), `payment_method`, `customer_id`, `from`, `to` (YYYY-MM-DD). `format=csv` or `format=xlsx` downloads the filtered list. |
| GET | `/orders/:id` | orders.view | Order, items with current stock, history, payments, shipments, invoices, returns, customer. |
| POST | `/orders/:id/status` | orders.manage | `{status, note?, tracking_number?, carrier?, tracking_url?, restock?}`. Only the transitions listed above are accepted. `shipped` creates the shipment and notifies the customer; `delivered` marks a cash order paid; `cancelled` returns stock. |
| POST | `/orders/:id/invoice` | orders.manage | Issues the tax invoice if the order has none. |
| POST | `/orders/:id/mark-paid` | payments.refund | `{method: cash\|transfer\|card, note?}` for money received outside the gateway. |
| POST | `/orders/:id/refund` | payments.refund | `{amount?, reason}`. Omit `amount` for the full remaining balance. Calls the gateway for online payments; always issues a credit note. |
| POST | `/orders/:id/sync-payment` | payments.view | Re-checks a pending online payment with the gateway. |
| POST | `/pos/sale` | pos.use | `{items: [{product_id, quantity}], payment_method: cash\|card, customer_name?, customer_phone?, vat_number?, coupon_code?}` → `{id, number, total, invoice_number}`. Deducts stock and issues the invoice immediately. |
| GET | `/payments` | payments.view | Filters: `status`, `provider`. |
| GET | `/returns` | returns.manage | Filter: `status`. Each row has `items_value` and `suggested` refund. |
| POST | `/returns/:id/action` | returns.manage | `{action: approve\|reject\|receive\|refund, note?, restock?, refund_amount?}`. `receive` puts the returned units back in stock (unless `restock: false`); `refund` defaults to the value of the returned units. |
| GET | `/invoices` | invoices.view | Filters: `q`, `kind` (`invoice`/`credit_note`), `from`, `to`. `format=csv\|xlsx`. |
| GET | `/invoices/:id/xml` | invoices.view | UBL 2.1 XML download. |
| POST | `/invoices/:id/submit` | settings.manage | Submits one invoice to ZATCA when phase 2 is configured (see ZATCA.md). |

### Products and inventory

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/products` | products.view | Filters: `q`, `status`, `category_id`, `brand_id`, `low=1`. `format=csv\|xlsx`. |
| GET | `/products/lookup?code=` | products.view | Exact barcode or SKU → one product with stock. Used by the scanner. |
| GET | `/products/:id` | products.view | With images. |
| POST · PUT | `/products`, `/products/:id` | products.manage | `{sku, barcode?, name_ar, name_en?, name_ur?, description_*?, category_id?, brand_id?, price, discount_price?, purchase_price?, vat_rate_bp?, weight_g?, length_mm?, width_mm?, height_mm?, warranty_months?, specs: [{label_ar, label_en?, label_ur?, value}], video_url?, is_featured?, is_new?, is_best_seller?, status: draft\|active\|archived, seo_title_*?, seo_description_*?, keywords?, slug?, min_stock?, location?, initial_stock? (create only)}`. Missing English/Urdu names fall back to Arabic. The slug stays the same on rename unless you send a new one. |
| DELETE | `/products/:id` | products.manage | Deletes, or archives when the product appears in orders (`{archived: true}`). |
| POST | `/products/:id/images` | products.manage | `multipart/form-data`, field `files` (up to 12 per request, 15 per product, 8 MB each; JPEG/PNG/WebP). Stored as WebP in two sizes. |
| PUT | `/products/:id/images/order` | products.manage | `{ids: [..]}`; the first is the main image. |
| DELETE | `/products/:id/images/:imageId` | products.manage | |
| POST | `/uploads?kind=brand\|banner\|content\|video` | products.manage, catalog.manage or content.manage | `multipart/form-data`, field `file` → `{url}`. Video: MP4/WebM up to 60 MB. |
| GET | `/inventory` | inventory.view | Filters: `q`, `low=1`, `out=1`. Includes stock value at purchase price. `format=csv\|xlsx`. |
| GET | `/inventory/low` | inventory.view | Products at or below their alert level. |
| POST | `/inventory/move` | inventory.manage | `{product_id, type: stock_in\|stock_out\|adjustment, quantity, unit_cost?, note?}`. For `adjustment`, `quantity` is the counted quantity. Never goes below zero. |
| GET | `/inventory/transactions` | inventory.view | Movement history. Filters: `product_id`, `type`. `format=csv\|xlsx`. |

### Reference data and content (uniform CRUD)

Each resource supports `GET /x` (list, with `q` where it makes sense), `GET /x/:id`,
`POST /x`, `PUT /x/:id`, `DELETE /x/:id`. `409 in_use` when the row is still referenced.

| Resource | Read | Write |
|---|---|---|
| `/categories` (tree: `parent_id`) | products.view | catalog.manage |
| `/brands` | products.view | catalog.manage |
| `/coupons` (`percent`, `fixed`, `free_shipping`; limits, dates, minimum basket) | promotions.manage | promotions.manage |
| `/discounts` (scheduled price cuts for all products, a category, a brand or one product) | promotions.manage | promotions.manage |
| `/banners`, `/homepage-sections`, `/pages`, `/faqs` | content.manage | content.manage |
| `/shipping-methods`, `/shipping-rates`, `/cities` | shipping.manage | shipping.manage |
| `/roles` | users.manage | users.manage |

`GET /regions` (any admin) lists the 13 regions.

### Customers, staff, reviews, tickets

| Method | Path | Permission |
|---|---|---|
| GET | `/customers` (`q`; `format=csv\|xlsx`), `/customers/:id` (with orders and addresses) | customers.view |
| PUT | `/customers/:id` `{name, phone?, company_name?, vat_number?, account_status?}` | customers.manage |
| GET · POST | `/users` — staff accounts. `POST {name, email, password, role_id}` | users.manage |
| PUT | `/users/:id` `{name, role_id, status: active\|disabled, password?}`. You cannot disable or demote yourself. | users.manage |
| GET | `/reviews` (`status`) | reviews.manage |
| POST | `/reviews/:id/status` `{status: approved\|rejected}` | reviews.manage |
| DELETE | `/reviews/:id` | reviews.manage |
| GET | `/tickets` (`status`), `/tickets/:id` | tickets.manage |
| POST | `/tickets/:id/reply` `{message}`, `/tickets/:id/status` `{status}` | tickets.manage |

### Dashboard, reports, settings, logs

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/dashboard` | dashboard.view | KPIs, 30-day sales series, recent orders, top products, low stock. Sales figures are omitted for roles without `orders.view` or `reports.view`. |
| GET | `/reports/sales` | reports.view | `from`, `to`, `group=day\|month`. Totals, by payment method, by city. |
| GET | `/reports/products` | reports.view | Units and revenue per product. |
| GET | `/reports/profit` | reports.view | Revenue excluding VAT minus purchase cost. |
| GET | `/reports/customers` | reports.view | Orders and spend per customer. |
| GET | `/reports/vat` | reports.view | Per tax month and rate: sales, credit notes, net VAT due. |
| GET | `/settings` | settings.manage | All setting groups plus the readiness of each integration (never the secrets). |
| PUT | `/settings/:group` | settings.manage | Groups: `store`, `tax`, `checkout`, `numbering`, `reviews`, `notifications`, `seo`. Send only the keys you change. |
| GET | `/audit-logs` | logs.view | Filters: `q`, `entity`. |
| GET · POST | `/notifications`, `/notifications/read` | dashboard.view | Staff alerts and the outgoing-message log. |

All report endpoints accept `format=csv` or `format=xlsx`. CSV files are UTF-8 with a BOM
so Excel shows Arabic correctly; cell values that start with `=`, `+`, `-` or `@` are
prefixed with an apostrophe.
