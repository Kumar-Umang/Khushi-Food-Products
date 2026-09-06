CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS kv_state (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payment_orders (
  order_id TEXT PRIMARY KEY,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  receipt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  payment_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);

-- Customer accounts and delivery details.
CREATE TABLE IF NOT EXISTS customer_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  whatsapp_consent TEXT NOT NULL DEFAULT 'N' CHECK (whatsapp_consent IN ('Y','N')),
  email_consent TEXT NOT NULL DEFAULT 'N' CHECK (email_consent IN ('Y','N')),
  active TEXT NOT NULL DEFAULT 'Y' CHECK (active IN ('Y','N')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_accounts_email ON customer_accounts(email);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  landmark TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  is_default TEXT NOT NULL DEFAULT 'Y' CHECK (is_default IN ('Y','N')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES customer_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES customer_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expires ON customer_sessions(expires_at);

CREATE TABLE IF NOT EXISTS customer_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL,
  subtotal INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  delivery_name TEXT NOT NULL,
  delivery_mobile TEXT NOT NULL,
  delivery_email TEXT,
  delivery_address_line1 TEXT NOT NULL,
  delivery_address_line2 TEXT,
  delivery_landmark TEXT,
  delivery_city TEXT NOT NULL,
  delivery_state TEXT NOT NULL,
  delivery_pincode TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES customer_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_customer_orders_customer ON customer_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_orders_status ON customer_orders(status);

CREATE TABLE IF NOT EXISTS customer_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_order_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  pack TEXT,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  line_total INTEGER NOT NULL,
  FOREIGN KEY(customer_order_id) REFERENCES customer_orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_customer_order_items_order ON customer_order_items(customer_order_id);

CREATE TABLE IF NOT EXISTS checkout_orders (
  razorpay_order_id TEXT PRIMARY KEY,
  customer_order_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  receipt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  payment_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TEXT,
  FOREIGN KEY(customer_order_id) REFERENCES customer_orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_checkout_orders_customer_order ON checkout_orders(customer_order_id);
