import { nanoid } from "nanoid";
import { migrate, db } from "./schema";

function hashPassword(pw: string): string {
  // Demo-only hash. Replace with bcrypt/argon2 before any real deployment.
  return `demo:${Buffer.from(pw).toString("base64")}`;
}

export function seed() {
  migrate();

  const existing = db.prepare("SELECT COUNT(*) as c FROM exchanges").get() as { c: number };
  if (existing.c > 0) {
    console.log("Database already seeded.");
    return;
  }

  const now = new Date().toISOString();

  const exchanges = [
    {
      id: "ex_bay",
      name: "Bay Area Barter",
      slug: "bay-area",
      operator_wallet: "0x0000000000000000000000000000000000000b01",
      chain_exchange_id: 1,
      fee_bps: 1000,
    },
    {
      id: "ex_pacific",
      name: "Pacific Trade Exchange",
      slug: "pacific",
      operator_wallet: "0x0000000000000000000000000000000000000b02",
      chain_exchange_id: 2,
      fee_bps: 1000,
    },
    {
      id: "ex_desert",
      name: "Desert Mutual",
      slug: "desert",
      operator_wallet: "0x0000000000000000000000000000000000000b03",
      chain_exchange_id: 3,
      fee_bps: 1000,
    },
  ];

  const insertEx = db.prepare(`
    INSERT INTO exchanges (id, name, slug, operator_wallet, chain_exchange_id, fee_bps, status, branding_json, created_at)
    VALUES (@id, @name, @slug, @operator_wallet, @chain_exchange_id, @fee_bps, 'active', '{}', @created_at)
  `);

  for (const ex of exchanges) {
    insertEx.run({ ...ex, created_at: now });
  }

  const categories = [
    { id: "cat_food", name: "Food & Beverage", slug: "food", is_accommodation: 0 },
    { id: "cat_prof", name: "Professional Services", slug: "professional", is_accommodation: 0 },
    { id: "cat_home", name: "Home & Construction", slug: "home", is_accommodation: 0 },
    { id: "cat_travel", name: "Travel & Accommodations", slug: "accommodations", is_accommodation: 1 },
    { id: "cat_health", name: "Health & Wellness", slug: "health", is_accommodation: 0 },
  ];

  const insertCat = db.prepare(`
    INSERT INTO categories (id, parent_id, name, slug, is_accommodation)
    VALUES (@id, NULL, @name, @slug, @is_accommodation)
  `);
  for (const c of categories) insertCat.run(c);

  const users = [
    {
      id: "usr_admin",
      exchange_id: "ex_bay",
      wallet: "0x00000000000000000000000000000000000000a1",
      email: "admin@barterchain.local",
      business: "BarterChain Platform",
      contact: "Platform Admin",
      role: "admin",
      balance: 0,
      password: "admin123",
    },
    {
      id: "usr_op_bay",
      exchange_id: "ex_bay",
      wallet: "0x0000000000000000000000000000000000000b01",
      email: "operator@baybarter.local",
      business: "Bay Area Barter HQ",
      contact: "Sam Operator",
      role: "operator",
      balance: 0,
      password: "operator123",
    },
    {
      id: "usr_broker",
      exchange_id: "ex_bay",
      wallet: "0x0000000000000000000000000000000000000b11",
      email: "broker@baybarter.local",
      business: "Bay Broker Desk",
      contact: "Blake Broker",
      role: "broker",
      balance: 0,
      password: "broker123",
    },
    {
      id: "usr_cafe",
      exchange_id: "ex_bay",
      wallet: "0x0000000000000000000000000000000000000c01",
      email: "hello@coastalcafe.local",
      business: "Coastal Cafe",
      contact: "Maya Chen",
      role: "member",
      balance: 425_000,
      password: "member123",
    },
    {
      id: "usr_print",
      exchange_id: "ex_bay",
      wallet: "0x0000000000000000000000000000000000000c02",
      email: "jobs@printworks.local",
      business: "PrintWorks Studio",
      contact: "Jordan Lee",
      role: "member",
      balance: 180_000,
      password: "member123",
    },
    {
      id: "usr_lodge",
      exchange_id: "ex_pacific",
      wallet: "0x0000000000000000000000000000000000000c03",
      email: "stay@redwoodlodge.local",
      business: "Redwood Lodge",
      contact: "Alex Rivera",
      role: "member",
      balance: 890_000,
      password: "member123",
    },
    {
      id: "usr_hvac",
      exchange_id: "ex_desert",
      wallet: "0x0000000000000000000000000000000000000c04",
      email: "service@desertair.local",
      business: "Desert Air HVAC",
      contact: "Chris Najafi",
      role: "member",
      balance: 95_000,
      password: "member123",
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (
      id, exchange_id, wallet_address, email, phone, business_name, contact_name,
      role, password_hash, status, wants_trade_flag, balance_cents, created_at
    ) VALUES (
      @id, @exchange_id, @wallet_address, @email, @phone, @business_name, @contact_name,
      @role, @password_hash, 'active', @wants_trade_flag, @balance_cents, @created_at
    )
  `);

  for (const u of users) {
    insertUser.run({
      id: u.id,
      exchange_id: u.exchange_id,
      wallet_address: u.wallet,
      email: u.email,
      phone: "+15555550100",
      business_name: u.business,
      contact_name: u.contact,
      role: u.role,
      password_hash: hashPassword(u.password),
      wants_trade_flag: u.role === "member" ? 1 : 0,
      balance_cents: u.balance,
      created_at: now,
    });
  }

  db.prepare(`
    INSERT INTO credit_lines (id, user_id, limit_cents, outstanding_cents, approved_by, approved_at, status)
    VALUES (?, ?, ?, 0, ?, ?, 'active')
  `).run(nanoid(), "usr_cafe", 500_000, "usr_op_bay", now);

  db.prepare(`
    INSERT INTO credit_lines (id, user_id, limit_cents, outstanding_cents, approved_by, approved_at, status)
    VALUES (?, ?, ?, 0, ?, ?, 'active')
  `).run(nanoid(), "usr_print", 250_000, "usr_op_bay", now);

  db.prepare(`
    INSERT INTO credit_lines (id, user_id, limit_cents, outstanding_cents, approved_by, approved_at, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
  `).run(nanoid(), "usr_hvac", 300_000, 50_000, "usr_admin", now);

  const listings = [
    {
      user_id: "usr_cafe",
      exchange_id: "ex_bay",
      type: "offer",
      title: "Catering for 20 — breakfast spread",
      description: "Pastries, coffee, fruit, and breakfast sandwiches delivered within 15 miles.",
      category_id: "cat_food",
      price_cents: 45_000,
      featured_until: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
    {
      user_id: "usr_print",
      exchange_id: "ex_bay",
      type: "offer",
      title: "Business card package (500)",
      description: "Full-color, double-sided cards on heavy stock. 3-day turnaround.",
      category_id: "cat_prof",
      price_cents: 12_500,
      featured_until: null,
    },
    {
      user_id: "usr_lodge",
      exchange_id: "ex_pacific",
      type: "offer",
      title: "Two-night forest cabin stay",
      description: "Midweek stay for two. Kitchenette, trail access, quiet evenings.",
      category_id: "cat_travel",
      price_cents: 320_000,
      featured_until: new Date(Date.now() + 14 * 86400000).toISOString(),
    },
    {
      user_id: "usr_hvac",
      exchange_id: "ex_desert",
      type: "want",
      title: "Looking for website redesign",
      description: "Need a clean service-business site with booking form. Prefer full trade.",
      category_id: "cat_prof",
      price_cents: 200_000,
      featured_until: null,
    },
    {
      user_id: "usr_cafe",
      exchange_id: "ex_bay",
      type: "want",
      title: "Need plumbing repair — kitchen line",
      description: "Slow drain and possible leak under prep sink. Can pay full trade.",
      category_id: "cat_home",
      price_cents: 75_000,
      featured_until: null,
    },
  ];

  const insertListing = db.prepare(`
    INSERT INTO listings (
      id, user_id, exchange_id, type, title, description, category_id,
      price_cents, payment_mode, cash_portion_pct, images_json, status, featured_until, created_at
    ) VALUES (
      @id, @user_id, @exchange_id, @type, @title, @description, @category_id,
      @price_cents, 'full_trade', 0, '[]', 'active', @featured_until, @created_at
    )
  `);

  for (const l of listings) {
    insertListing.run({
      id: nanoid(),
      ...l,
      created_at: new Date(Date.now() - Math.random() * 48 * 3600000).toISOString(),
    });
  }

  console.log("Seeded BarterChain demo data.");
  console.log("Logins:");
  console.log("  admin@barterchain.local / admin123");
  console.log("  operator@baybarter.local / operator123");
  console.log("  hello@coastalcafe.local / member123");
  console.log("  stay@redwoodlodge.local / member123");
}

if (require.main === module) {
  seed();
}
