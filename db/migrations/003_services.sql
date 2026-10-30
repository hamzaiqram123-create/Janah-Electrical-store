-- Home services: service types customers can book, technicians, and the jobs (bookings) they work on.

CREATE TABLE service_types (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name_ar text NOT NULL, name_en text NOT NULL DEFAULT '', name_ur text NOT NULL DEFAULT '',
  description_ar text NOT NULL DEFAULT '', description_en text NOT NULL DEFAULT '', description_ur text NOT NULL DEFAULT '',
  icon text,
  visit_fee integer NOT NULL DEFAULT 0 CHECK (visit_fee >= 0),        -- halalas, VAT included
  duration_min integer NOT NULL DEFAULT 60 CHECK (duration_min > 0),
  daily_capacity integer NOT NULL DEFAULT 6 CHECK (daily_capacity >= 0), -- jobs per time slot across all technicians
  sort integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE technicians (
  id serial PRIMARY KEY,
  user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  areas text NOT NULL DEFAULT '',
  skills text NOT NULL DEFAULT '',
  available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_bookings (
  id serial PRIMARY KEY,
  number text NOT NULL UNIQUE,
  customer_id integer NOT NULL REFERENCES customers(id),
  service_type_id integer NOT NULL REFERENCES service_types(id),
  technician_id integer REFERENCES technicians(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','assigned','on_the_way','arrived','in_progress','completed','cancelled')),
  problem text NOT NULL,
  photos jsonb NOT NULL DEFAULT '[]',
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  city text NOT NULL,
  address text NOT NULL,
  scheduled_date date NOT NULL,
  slot text NOT NULL,
  visit_fee integer NOT NULL DEFAULT 0,
  quote_lines jsonb NOT NULL DEFAULT '[]',   -- [{kind:'part'|'labor', product_id, name, qty, unit_price}] unit prices in halalas incl. VAT
  quote_total integer NOT NULL DEFAULT 0,
  quote_status text NOT NULL DEFAULT 'none' CHECK (quote_status IN ('none','sent','approved','rejected')),
  total integer NOT NULL DEFAULT 0,          -- visit fee + approved quote
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  payment_method text,
  paid_at timestamptz,
  before_photos jsonb NOT NULL DEFAULT '[]',
  after_photos jsonb NOT NULL DEFAULT '[]',
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  review text,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_bookings_customer_idx ON service_bookings (customer_id, created_at DESC);
CREATE INDEX service_bookings_tech_idx ON service_bookings (technician_id, scheduled_date);
CREATE INDEX service_bookings_date_idx ON service_bookings (scheduled_date, slot);

CREATE TABLE service_booking_events (
  id serial PRIMARY KEY,
  booking_id integer NOT NULL REFERENCES service_bookings(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  actor text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_booking_events_idx ON service_booking_events (booking_id, id);
