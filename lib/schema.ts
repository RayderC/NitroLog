// Readings are meters on distance vehicles and engine hours on hour-metered ones. Money is whole cents.
// To change the schema, add an entry to MIGRATIONS in lib/db.ts. Never edit a released SCHEMA_V* constant.
// Tire pressures are kPa and lap times are milliseconds.
export const SCHEMA_V1 = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 0,
  distance_unit TEXT NOT NULL DEFAULT 'mi' CHECK (distance_unit IN ('mi','km')),
  volume_unit TEXT NOT NULL DEFAULT 'gal' CHECK (volume_unit IN ('gal','L')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'car',
  year INTEGER,
  make TEXT,
  model TEXT,
  trim TEXT,
  engine TEXT,
  vin TEXT,
  plate TEXT,
  meter_type TEXT NOT NULL DEFAULT 'distance' CHECK (meter_type IN ('distance','hours')),
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX vehicles_owner ON vehicles(owner_id);

CREATE TABLE vehicle_members (
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('editor','viewer')),
  PRIMARY KEY (vehicle_id, user_id)
);
CREATE INDEX vehicle_members_user ON vehicle_members(user_id);

CREATE TABLE odometer_readings (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  reading REAL NOT NULL,
  date TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX odometer_vehicle ON odometer_readings(vehicle_id);

CREATE TABLE schedule_items (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  interval_reading REAL,
  interval_months INTEGER,
  base_date TEXT NOT NULL,
  base_reading REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX schedule_vehicle ON schedule_items(vehicle_id);

CREATE TABLE service_records (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  reading REAL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'maintenance',
  labor_hours REAL,
  labor_cost_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX service_vehicle ON service_records(vehicle_id, date);

CREATE TABLE service_items (
  id INTEGER PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES service_records(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'part' CHECK (kind IN ('part','fluid')),
  name TEXT NOT NULL,
  part_number TEXT,
  brand TEXT,
  quantity REAL,
  unit TEXT,
  cost_cents INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX service_items_service ON service_items(service_id);

CREATE TABLE service_tasks (
  service_id INTEGER NOT NULL REFERENCES service_records(id) ON DELETE CASCADE,
  schedule_id INTEGER NOT NULL REFERENCES schedule_items(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, schedule_id)
);
CREATE INDEX service_tasks_schedule ON service_tasks(schedule_id);

CREATE TABLE vehicle_specs (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  notes TEXT
);
CREATE INDEX specs_vehicle ON vehicle_specs(vehicle_id);

CREATE TABLE fuel_logs (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  reading REAL,
  volume_l REAL NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  full_tank INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX fuel_vehicle ON fuel_logs(vehicle_id, date);
`;

/** Phase 2: parts inventory and attachments. */
export const SCHEMA_V2 = `
CREATE TABLE inventory_items (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  part_number TEXT,
  brand TEXT,
  stock_in REAL NOT NULL DEFAULT 0,
  unit TEXT,
  location TEXT,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  min_quantity REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX inventory_owner ON inventory_items(owner_id);

ALTER TABLE service_items ADD COLUMN inventory_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL;
CREATE INDEX service_items_inventory ON service_items(inventory_id);

CREATE TABLE attachments (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES service_records(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'other',
  filename TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  caption TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX attachments_vehicle ON attachments(vehicle_id);
CREATE INDEX attachments_service ON attachments(service_id);
`;

/** Phase 3: builds and track days. */
export const SCHEMA_V3 = `
CREATE TABLE build_stages (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX build_stages_vehicle ON build_stages(vehicle_id);

CREATE TABLE build_tasks (
  id INTEGER PRIMARY KEY,
  stage_id INTEGER NOT NULL REFERENCES build_stages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  hours REAL
);
CREATE INDEX build_tasks_stage ON build_tasks(stage_id);

CREATE TABLE wishlist_items (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  stage_id INTEGER REFERENCES build_stages(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  url TEXT,
  planned_cents INTEGER NOT NULL DEFAULT 0,
  actual_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','bought','installed')),
  notes TEXT
);
CREATE INDEX wishlist_vehicle ON wishlist_items(vehicle_id);

CREATE TABLE build_log (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX build_log_vehicle ON build_log(vehicle_id, date);

ALTER TABLE attachments ADD COLUMN build_log_id INTEGER REFERENCES build_log(id) ON DELETE SET NULL;
CREATE INDEX attachments_build_log ON attachments(build_log_id);

CREATE TABLE track_days (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  track TEXT NOT NULL,
  conditions TEXT,
  setup TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX track_days_vehicle ON track_days(vehicle_id, date);

CREATE TABLE track_sessions (
  id INTEGER PRIMARY KEY,
  track_day_id INTEGER NOT NULL REFERENCES track_days(id) ON DELETE CASCADE,
  name TEXT,
  laps INTEGER,
  best_lap_ms INTEGER,
  pressure_fl REAL,
  pressure_fr REAL,
  pressure_rl REAL,
  pressure_rr REAL,
  notes TEXT
);
CREATE INDEX track_sessions_day ON track_sessions(track_day_id);
`;

/** Phase 4: push notifications and CSV import. */
export const SCHEMA_V4 = `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE push_sent (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id INTEGER NOT NULL REFERENCES schedule_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  sent_on TEXT NOT NULL,
  PRIMARY KEY (user_id, schedule_id)
);

ALTER TABLE service_records ADD COLUMN import_key TEXT;
ALTER TABLE fuel_logs ADD COLUMN import_key TEXT;
CREATE UNIQUE INDEX service_import ON service_records(import_key) WHERE import_key IS NOT NULL;
CREATE UNIQUE INDEX fuel_import ON fuel_logs(import_key) WHERE import_key IS NOT NULL;
`;

/** A sold vehicle is an archived one that also remembers the sale. */
export const SCHEMA_V5 = `
ALTER TABLE vehicles ADD COLUMN sold_on TEXT;
ALTER TABLE vehicles ADD COLUMN sold_cents INTEGER;
`;
