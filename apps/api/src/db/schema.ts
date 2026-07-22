import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(__dirname, "../../data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(path.join(dataDir, "barterchain.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS exchanges (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      operator_wallet TEXT NOT NULL,
      chain_exchange_id INTEGER NOT NULL,
      fee_bps INTEGER NOT NULL DEFAULT 1000,
      status TEXT NOT NULL DEFAULT 'active',
      branding_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      exchange_id TEXT NOT NULL REFERENCES exchanges(id),
      wallet_address TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      business_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      password_hash TEXT NOT NULL,
      tin_encrypted TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      wants_trade_flag INTEGER NOT NULL DEFAULT 0,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_lines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
      limit_cents INTEGER NOT NULL,
      outstanding_cents INTEGER NOT NULL DEFAULT 0,
      approved_by TEXT,
      approved_at TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      is_accommodation INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      exchange_id TEXT NOT NULL REFERENCES exchanges(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category_id TEXT REFERENCES categories(id),
      price_cents INTEGER NOT NULL,
      payment_mode TEXT NOT NULL DEFAULT 'full_trade',
      cash_portion_pct INTEGER NOT NULL DEFAULT 0,
      images_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      featured_until TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL REFERENCES users(id),
      seller_id TEXT NOT NULL REFERENCES users(id),
      gross_cents INTEGER NOT NULL,
      fee_cents INTEGER NOT NULL,
      operator_fee_cents INTEGER NOT NULL,
      platform_fee_cents INTEGER NOT NULL,
      is_cross_network INTEGER NOT NULL,
      cash_portion_cents INTEGER NOT NULL DEFAULT 0,
      tx_hash TEXT,
      trade_ref TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      listing_id TEXT,
      broker_id TEXT,
      failure_reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS member_fees (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      period TEXT NOT NULL,
      cash_cents INTEGER NOT NULL DEFAULT 0,
      trade_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      paid_at TEXT
    );

    CREATE TABLE IF NOT EXISTS statements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      period TEXT NOT NULL,
      opening_cents INTEGER NOT NULL,
      closing_cents INTEGER NOT NULL,
      pdf_url TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
