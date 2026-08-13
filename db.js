const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const slugify = require('./lib/slugify');

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
    original_path TEXT,
    slug TEXT,
    sku TEXT,
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
    original_path TEXT,
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

  CREATE TABLE IF NOT EXISTS store_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    position REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS store_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT,
    sku TEXT,
    description TEXT NOT NULL DEFAULT '',
    image_path TEXT NOT NULL,
    original_path TEXT,
    orientation TEXT NOT NULL DEFAULT 'portrait',
    price REAL NOT NULL DEFAULT 25.00,
    position REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS store_product_categories (
    product_id INTEGER NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES store_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    featured_image TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    position REAL NOT NULL DEFAULT 0,
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
if (!artworkCols.includes('original_path')) {
  db.exec(`ALTER TABLE artworks ADD COLUMN original_path TEXT`);
}
if (!artworkCols.includes('slug')) {
  db.exec(`ALTER TABLE artworks ADD COLUMN slug TEXT`);
}
if (!artworkCols.includes('sku')) {
  db.exec(`ALTER TABLE artworks ADD COLUMN sku TEXT`);
}

// Backfill slugs for any artwork that doesn't have one yet — existing
// pieces (added before individual pages existed) as well as any that
// somehow slipped through without one.
const artworksNeedingSlug = db.prepare('SELECT id, title FROM artworks WHERE slug IS NULL OR slug = ?').all('');
if (artworksNeedingSlug.length) {
  const setSlug = db.prepare('UPDATE artworks SET slug = ? WHERE id = ?');
  const slugTaken = db.prepare('SELECT id FROM artworks WHERE slug = ? AND id != ?');
  artworksNeedingSlug.forEach(row => {
    let base = slugify(row.title) || 'art';
    let finalSlug = base;
    let n = 2;
    while (slugTaken.get(finalSlug, row.id)) {
      finalSlug = `${base}-${n}`;
      n++;
    }
    setSlug.run(finalSlug, row.id);
  });
}

const artworkImageCols = db.prepare("PRAGMA table_info(artwork_images)").all().map(c => c.name);
if (artworkImageCols.length && !artworkImageCols.includes('original_path')) {
  db.exec(`ALTER TABLE artwork_images ADD COLUMN original_path TEXT`);
}

const postCols = db.prepare("PRAGMA table_info(posts)").all().map(c => c.name);
if (postCols.length && !postCols.includes('position')) {
  db.exec(`ALTER TABLE posts ADD COLUMN position REAL NOT NULL DEFAULT 0`);
  // Backfill so existing posts keep their current (newest-first) order
  // instead of all landing on position 0 at once.
  const existingPosts = db.prepare('SELECT id FROM posts ORDER BY published_at DESC').all();
  const setPosition = db.prepare('UPDATE posts SET position = ? WHERE id = ?');
  existingPosts.forEach((row, index) => setPosition.run(index, row.id));
}

module.exports = db;
