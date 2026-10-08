-- شركة جناح الريادة — initial schema
-- Conventions:
--   * All money columns are INTEGER halalas (1 SAR = 100 halalas).
--   * VAT rates are INTEGER basis points (1500 = 15%).
--   * Translatable text uses *_ar / *_en / *_ur columns.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Normalises Arabic/Urdu/English text for search: strips diacritics and tatweel,
-- unifies alef/yeh/kaf/heh variants and converts Eastern digits to ASCII.
CREATE OR REPLACE FUNCTION norm_text(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(translate(
    regexp_replace(coalesce(t, ''), '[ً-ٰٟـ]', '', 'g'),
    'أإآٱىیےئؤةکھہۂۃ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    'ااااييييوهكهههه01234567890123456789'))
$$;

-- ───────────── identity & access ─────────────
CREATE TABLE roles (
  id serial PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL,
  phone text,
  name text NOT NULL DEFAULT '',
  password_hash text,
  kind text NOT NULL DEFAULT 'customer' CHECK (kind IN ('customer','admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  locale text NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar','en','ur')),
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE admins (
  id serial PRIMARY KEY,
  user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role_id integer NOT NULL REFERENCES roles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id serial PRIMARY KEY,
  user_id integer UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  phone text,
  company_name text,
  vat_number text,
  is_guest boolean NOT NULL DEFAULT false,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_email_idx ON customers (lower(email));
CREATE INDEX customers_phone_idx ON customers (phone);

CREATE TABLE sessions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  ip text,
  user_agent text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE password_resets (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────── geography & shipping ─────────────
CREATE TABLE regions (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL, name_en text NOT NULL, name_ur text NOT NULL
);

CREATE TABLE cities (
  id serial PRIMARY KEY,
  region_id integer NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  name_ar text NOT NULL, name_en text NOT NULL, name_ur text NOT NULL,
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX cities_region_idx ON cities (region_id);

CREATE TABLE addresses (
  id serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text,
  recipient_name text NOT NULL,
  phone text NOT NULL,
  city_id integer NOT NULL REFERENCES cities(id),
  district text NOT NULL,
  street text NOT NULL,
  building_no text,
  postal_code text,
  short_address text,
  notes text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX addresses_customer_idx ON addresses (customer_id);

CREATE TABLE shipping_methods (
  id serial PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name_ar text NOT NULL, name_en text NOT NULL, name_ur text NOT NULL,
  description_ar text NOT NULL DEFAULT '', description_en text NOT NULL DEFAULT '', description_ur text NOT NULL DEFAULT '',
  carrier text,
  base_fee integer NOT NULL DEFAULT 0 CHECK (base_fee >= 0),
  free_threshold integer CHECK (free_threshold >= 0),
  min_days integer NOT NULL DEFAULT 1,
  max_days integer NOT NULL DEFAULT 3,
  cod_allowed boolean NOT NULL DEFAULT true,
  is_pickup boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0
);

-- Per-region / per-city overrides of fee and lead time. active=false blocks the method there.
CREATE TABLE shipping_rates (
  id serial PRIMARY KEY,
  method_id integer NOT NULL REFERENCES shipping_methods(id) ON DELETE CASCADE,
  region_id integer REFERENCES regions(id) ON DELETE CASCADE,
  city_id integer REFERENCES cities(id) ON DELETE CASCADE,
  fee integer NOT NULL CHECK (fee >= 0),
  min_days integer,
  max_days integer,
  active boolean NOT NULL DEFAULT true,
  CHECK (region_id IS NOT NULL OR city_id IS NOT NULL)
);
CREATE INDEX shipping_rates_method_idx ON shipping_rates (method_id);

-- ───────────── catalogue ─────────────
CREATE TABLE categories (
  id serial PRIMARY KEY,
  parent_id integer REFERENCES categories(id) ON DELETE SET NULL CHECK (parent_id <> id),
  slug text NOT NULL UNIQUE,
  name_ar text NOT NULL, name_en text NOT NULL, name_ur text NOT NULL,
  description_ar text NOT NULL DEFAULT '', description_en text NOT NULL DEFAULT '', description_ur text NOT NULL DEFAULT '',
  icon text,
  image_url text,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX categories_parent_idx ON categories (parent_id);

CREATE TABLE brands (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name_ar text NOT NULL, name_en text NOT NULL, name_ur text NOT NULL,
  logo_url text,
  is_popular boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id serial PRIMARY KEY,
  sku text NOT NULL UNIQUE,
  barcode text,
  slug text NOT NULL UNIQUE,
  name_ar text NOT NULL, name_en text NOT NULL, name_ur text NOT NULL,
  description_ar text NOT NULL DEFAULT '', description_en text NOT NULL DEFAULT '', description_ur text NOT NULL DEFAULT '',
  brand_id integer REFERENCES brands(id) ON DELETE SET NULL,
  category_id integer REFERENCES categories(id) ON DELETE SET NULL,
  purchase_price integer NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  price integer NOT NULL CHECK (price >= 0),
  discount_price integer CHECK (discount_price >= 0),
  -- price actually charged: lowest of price, discount_price and active discount rules (maintained by the app)
  effective_price integer NOT NULL,
  vat_rate_bp integer NOT NULL DEFAULT 1500 CHECK (vat_rate_bp BETWEEN 0 AND 10000),
  weight_g integer,
  length_mm integer, width_mm integer, height_mm integer,
  warranty_months integer NOT NULL DEFAULT 0,
  specs jsonb NOT NULL DEFAULT '[]',
  video_url text,
  is_featured boolean NOT NULL DEFAULT false,
  is_new boolean NOT NULL DEFAULT false,
  is_best_seller boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  seo_title_ar text, seo_title_en text, seo_title_ur text,
  seo_description_ar text, seo_description_en text, seo_description_ur text,
  keywords text NOT NULL DEFAULT '',
  search_text text NOT NULL DEFAULT '',
  rating_avg real NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  sold_count integer NOT NULL DEFAULT 0,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX products_barcode_key ON products (barcode) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE INDEX products_category_idx ON products (category_id) WHERE status = 'active';
CREATE INDEX products_brand_idx ON products (brand_id) WHERE status = 'active';
CREATE INDEX products_price_idx ON products (effective_price) WHERE status = 'active';
CREATE INDEX products_created_idx ON products (created_at DESC);
CREATE INDEX products_sold_idx ON products (sold_count DESC);
CREATE INDEX products_search_trgm ON products USING gin (search_text gin_trgm_ops);

CREATE TABLE product_images (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url text NOT NULL,
  thumb_url text,
  alt text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_images_product_idx ON product_images (product_id, sort);

CREATE TABLE inventory (
  product_id integer PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_stock integer NOT NULL DEFAULT 5 CHECK (min_stock >= 0),
  location text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_transactions (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('stock_in','stock_out','adjustment','sale','return','cancellation')),
  quantity integer NOT NULL,            -- signed change
  balance_after integer NOT NULL,
  unit_cost integer,
  reference_type text,
  reference_id text,
  note text,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_tx_product_idx ON inventory_transactions (product_id, created_at DESC);
CREATE INDEX inventory_tx_created_idx ON inventory_transactions (created_at DESC);

-- ───────────── promotions ─────────────
CREATE TABLE coupons (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('percent','fixed','free_shipping')),
  value integer NOT NULL DEFAULT 0 CHECK (value >= 0),   -- basis points for percent, halalas for fixed
  min_subtotal integer NOT NULL DEFAULT 0,
  max_discount integer,
  usage_limit integer,
  per_customer_limit integer,
  used_count integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE discounts (
  id serial PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('percent','fixed')),
  value integer NOT NULL CHECK (value > 0),
  scope text NOT NULL CHECK (scope IN ('all','category','brand','product')),
  scope_id integer,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────── cart ─────────────
CREATE TABLE carts (
  id serial PRIMARY KEY,
  token text NOT NULL UNIQUE,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  coupon_code text,
  email text,
  locale text NOT NULL DEFAULT 'ar',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','converted','abandoned')),
  recovery_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX carts_user_idx ON carts (user_id) WHERE status = 'active';
CREATE INDEX carts_updated_idx ON carts (updated_at) WHERE status = 'active';

CREATE TABLE cart_items (
  id serial PRIMARY KEY,
  cart_id integer NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)
);

-- ───────────── orders ─────────────
CREATE TABLE orders (
  id serial PRIMARY KEY,
  number text NOT NULL UNIQUE,
  access_key text NOT NULL,
  channel text NOT NULL DEFAULT 'web' CHECK (channel IN ('web','pos')),
  customer_id integer NOT NULL REFERENCES customers(id),
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','confirmed','processing','ready_for_shipment','shipped','out_for_delivery','delivered','cancelled','returned','refunded')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','paid','failed','refunded','partially_refunded')),
  payment_method text NOT NULL,
  locale text NOT NULL DEFAULT 'ar',
  currency text NOT NULL DEFAULT 'SAR',
  prices_include_vat boolean NOT NULL DEFAULT true,
  items_subtotal integer NOT NULL,      -- sum of lines incl. VAT, after product discounts
  discount_total integer NOT NULL DEFAULT 0,
  shipping_fee integer NOT NULL DEFAULT 0,
  cod_fee integer NOT NULL DEFAULT 0,
  total_excl_vat integer NOT NULL,
  vat_total integer NOT NULL,
  total integer NOT NULL,
  coupon_code text,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}',
  shipping_method_id integer REFERENCES shipping_methods(id) ON DELETE SET NULL,
  shipping_method_name text,
  delivery_from date,
  delivery_to date,
  notes text,
  cancel_reason text,
  cart_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  delivered_at timestamptz
);
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);
CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status, created_at DESC);
CREATE INDEX orders_created_idx ON orders (created_at DESC);

CREATE TABLE order_items (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id integer REFERENCES products(id) ON DELETE SET NULL,
  sku text NOT NULL,
  barcode text,
  name_ar text NOT NULL, name_en text NOT NULL, name_ur text NOT NULL,
  image_url text,
  quantity integer NOT NULL CHECK (quantity > 0),
  original_unit_price integer NOT NULL, -- list price incl. VAT
  unit_price integer NOT NULL,          -- charged price incl. VAT
  unit_cost integer NOT NULL DEFAULT 0,
  vat_rate_bp integer NOT NULL,
  line_total integer NOT NULL,          -- unit_price * quantity
  discount_alloc integer NOT NULL DEFAULT 0, -- share of coupon discount
  net_amount integer NOT NULL,          -- excl. VAT, after discounts
  vat_amount integer NOT NULL
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_product_idx ON order_items (product_id);

CREATE TABLE order_status_history (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order_idx ON order_status_history (order_id, created_at);

CREATE TABLE coupon_redemptions (
  id serial PRIMARY KEY,
  coupon_id integer NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coupon_redemptions_coupon_idx ON coupon_redemptions (coupon_id, customer_id);

CREATE TABLE payments (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider text NOT NULL,               -- cod | moyasar | pos
  method text,                          -- mada | creditcard | applepay | stcpay | cash ...
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','refunded','partially_refunded')),
  amount integer NOT NULL,
  refunded_amount integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  gateway_id text,                      -- gateway invoice / payment reference
  gateway_payment_id text,
  gateway_url text,
  raw jsonb,                            -- sanitised gateway payload (never card numbers)
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments (order_id);
CREATE UNIQUE INDEX payments_gateway_key ON payments (provider, gateway_id) WHERE gateway_id IS NOT NULL;

CREATE TABLE shipments (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier text,
  tracking_number text NOT NULL UNIQUE,
  tracking_url text,
  status text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','shipped','out_for_delivery','delivered','returned')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipments_order_idx ON shipments (order_id);

CREATE TABLE returns (
  id serial PRIMARY KEY,
  number text NOT NULL UNIQUE,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','received','refunded')),
  reason text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',     -- [{order_item_id, quantity}]
  refund_amount integer NOT NULL DEFAULT 0,
  restock boolean NOT NULL DEFAULT true,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX returns_order_idx ON returns (order_id);

-- ───────────── engagement ─────────────
CREATE TABLE reviews (
  id serial PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  verified_purchase boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, customer_id)
);
CREATE INDEX reviews_product_idx ON reviews (product_id) WHERE status = 'approved';

CREATE TABLE wishlists (
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, product_id)
);

-- ───────────── invoicing & tax (ZATCA-oriented) ─────────────
CREATE TABLE invoices (
  id serial PRIMARY KEY,
  number text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'invoice' CHECK (kind IN ('invoice','credit_note')),
  type text NOT NULL DEFAULT 'simplified' CHECK (type IN ('simplified','standard')),
  order_id integer REFERENCES orders(id) ON DELETE SET NULL,
  ref_invoice_id integer REFERENCES invoices(id),
  uuid uuid NOT NULL UNIQUE,
  icv integer NOT NULL UNIQUE,          -- invoice counter value
  previous_hash text NOT NULL,          -- PIH
  hash text NOT NULL,
  qr_base64 text NOT NULL,
  xml text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  seller jsonb NOT NULL,
  buyer jsonb NOT NULL,
  currency text NOT NULL DEFAULT 'SAR',
  payment_method text,
  taxable_amount integer NOT NULL,      -- total excl. VAT
  vat_amount integer NOT NULL,
  total integer NOT NULL,
  discount_amount integer NOT NULL DEFAULT 0,
  reason text,
  zatca_status text NOT NULL DEFAULT 'not_submitted' CHECK (zatca_status IN ('not_submitted','queued','reported','cleared','warning','rejected','error')),
  zatca_response jsonb,
  zatca_submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_order_idx ON invoices (order_id);
CREATE INDEX invoices_issued_idx ON invoices (issued_at DESC);

CREATE TABLE invoice_items (
  id serial PRIMARY KEY,
  invoice_id integer NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  sku text,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  quantity integer NOT NULL,
  unit_price_excl integer NOT NULL,
  discount_excl integer NOT NULL DEFAULT 0,
  net_amount integer NOT NULL,
  vat_rate_bp integer NOT NULL,
  vat_amount integer NOT NULL,
  total integer NOT NULL
);
CREATE INDEX invoice_items_invoice_idx ON invoice_items (invoice_id);

CREATE TABLE tax_records (
  id serial PRIMARY KEY,
  invoice_id integer NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  period date NOT NULL,                 -- first day of the tax month
  type text NOT NULL CHECK (type IN ('sale','refund')),
  vat_rate_bp integer NOT NULL,
  taxable_amount integer NOT NULL,      -- signed
  vat_amount integer NOT NULL,          -- signed
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tax_records_period_idx ON tax_records (period);

-- ───────────── messaging & support ─────────────
CREATE TABLE notifications (
  id serial PRIMARY KEY,
  event text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp','admin')),
  recipient text,
  user_id integer REFERENCES users(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'ar',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','skipped')),
  error text,
  attempts integer NOT NULL DEFAULT 0,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX notifications_status_idx ON notifications (status, created_at);
CREATE INDEX notifications_channel_idx ON notifications (channel, created_at DESC);

CREATE TABLE support_tickets (
  id serial PRIMARY KEY,
  number text NOT NULL UNIQUE,
  customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  subject text NOT NULL,
  order_number text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  source text NOT NULL DEFAULT 'contact_form',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_tickets_status_idx ON support_tickets (status, updated_at DESC);

CREATE TABLE ticket_messages (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author text NOT NULL CHECK (author IN ('customer','staff')),
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_messages_ticket_idx ON ticket_messages (ticket_id, created_at);

-- ───────────── content & configuration ─────────────
CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE banners (
  id serial PRIMARY KEY,
  placement text NOT NULL DEFAULT 'hero' CHECK (placement IN ('hero','promo')),
  title_ar text NOT NULL, title_en text NOT NULL, title_ur text NOT NULL,
  subtitle_ar text NOT NULL DEFAULT '', subtitle_en text NOT NULL DEFAULT '', subtitle_ur text NOT NULL DEFAULT '',
  cta_ar text NOT NULL DEFAULT '', cta_en text NOT NULL DEFAULT '', cta_ur text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  image_url text,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz
);

CREATE TABLE homepage_sections (
  id serial PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('hero','categories','featured','best_sellers','new_arrivals','deals','brands','promo','reviews','why_us','delivery','contact')),
  title_ar text NOT NULL DEFAULT '', title_en text NOT NULL DEFAULT '', title_ur text NOT NULL DEFAULT '',
  item_limit integer NOT NULL DEFAULT 8,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE pages (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title_ar text NOT NULL, title_en text NOT NULL, title_ur text NOT NULL,
  body_ar text NOT NULL DEFAULT '', body_en text NOT NULL DEFAULT '', body_ur text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE faqs (
  id serial PRIMARY KEY,
  question_ar text NOT NULL, question_en text NOT NULL, question_ur text NOT NULL,
  answer_ar text NOT NULL, answer_en text NOT NULL, answer_ur text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE audit_logs (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  actor text NOT NULL DEFAULT 'system',
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  meta jsonb NOT NULL DEFAULT '{}',
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, entity_id);

-- Gapless counters (order numbers, invoice numbers, ZATCA ICV) — incremented inside the owning transaction.
CREATE TABLE counters (
  key text PRIMARY KEY,
  value integer NOT NULL DEFAULT 0
);
