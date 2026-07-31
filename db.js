const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'wailea.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS artworks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    image_path TEXT NOT NULL,
    dimensions TEXT NOT NULL DEFAULT '8.5" x 11"',
    material TEXT NOT NULL DEFAULT '',
    orientation TEXT NOT NULL DEFAULT 'portrait',
    ships_as_canvas INTEGER NOT NULL DEFAULT 0,
    price_retail REAL NOT NULL DEFAULT 45.00,
    price_bulk_packaging REAL NOT NULL DEFAULT 30.00,
    price_bulk_no_packaging REAL NOT NULL DEFAULT 25.00,
    position REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS artwork_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    position REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    position REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS artwork_categories (
    artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (artwork_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    featured_image TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    published_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migration: add 'dimensions' column for databases created before this feature existed
const artworkCols = db.prepare("PRAGMA table_info(artworks)").all().map(c => c.name);
if (!artworkCols.includes('dimensions')) {
  db.exec(`ALTER TABLE artworks ADD COLUMN dimensions TEXT NOT NULL DEFAULT '8.5" x 11"'`);
}
if (!artworkCols.includes('material')) {
  db.exec(`ALTER TABLE artworks ADD COLUMN material TEXT NOT NULL DEFAULT ''`);
}
if (!artworkCols.includes('ships_as_canvas')) {
  db.exec(`ALTER TABLE artworks ADD COLUMN ships_as_canvas INTEGER NOT NULL DEFAULT 0`);
}
if (!artworkCols.includes('orientation')) {
  db.exec(`ALTER TABLE artworks ADD COLUMN orientation TEXT NOT NULL DEFAULT 'portrait'`);
}

module.exports = db;
