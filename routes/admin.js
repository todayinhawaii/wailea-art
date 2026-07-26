const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const upload = require('../lib/upload');
const requireAdmin = require('../lib/requireAdmin');
const slugify = require('../lib/slugify');
const excerptFromHtml = require('../lib/excerpt');

// ---------- Login ----------

router.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { error: null, page: 'admin' });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || 'admin';
  const plainPassword = process.env.ADMIN_PASSWORD || '';
  const adminHash = process.env.ADMIN_PASS_HASH || '';

  const validUser = (username || '').trim() === adminUser.trim();

  let validPass = false;
  if (plainPassword) {
    // Simple direct comparison — easiest to set up correctly in Render.
    validPass = (password || '').trim() === plainPassword.trim();
  } else if (adminHash) {
    validPass = bcrypt.compareSync((password || '').trim(), adminHash);
  }

  if (!validUser || !validPass) {
    return res.render('admin/login', { error: 'Incorrect username or password.', page: 'admin' });
  }

  req.session.isAdmin = true;
  res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ---------- Helpers ----------

function getArtworksWithCategories() {
  const artworks = db.prepare('SELECT * FROM artworks ORDER BY position ASC').all();
  const catStmt = db.prepare(`
    SELECT c.id, c.name FROM categories c
    JOIN artwork_categories ac ON ac.category_id = c.id
    WHERE ac.artwork_id = ?
    ORDER BY c.name ASC
  `);
  return artworks.map(a => ({ ...a, categories: catStmt.all(a.id) }));
}

function dashboardData() {
  return {
    artworks: getArtworksWithCategories(),
    categories: db.prepare('SELECT * FROM categories ORDER BY position ASC, name ASC').all(),
    messages: db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 20').all(),
    posts: db.prepare('SELECT * FROM posts ORDER BY published_at DESC').all()
  };
}

function setArtworkCategories(artworkId, categoryIds) {
  db.prepare('DELETE FROM artwork_categories WHERE artwork_id = ?').run(artworkId);
  const insert = db.prepare('INSERT OR IGNORE INTO artwork_categories (artwork_id, category_id) VALUES (?, ?)');
  const tx = db.transaction((ids) => {
    ids.forEach(cid => insert.run(artworkId, cid));
  });
  tx(categoryIds);
}

function normalizeCategoryIds(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map(v => parseInt(v, 10)).filter(v => Number.isInteger(v));
}

// ---------- Dashboard ----------

router.get('/', requireAdmin, (req, res) => {
  const bulkAdded = parseInt(req.query.bulkAdded, 10);
  const success = bulkAdded ? `Added ${bulkAdded} piece${bulkAdded === 1 ? '' : 's'} to your gallery. Click "Edit" on each to add a title, description, or categories.` : null;
  res.render('admin/dashboard', { ...dashboardData(), error: null, success, page: 'admin' });
});

// ---------- Categories ----------

router.post('/categories', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.render('admin/dashboard', { ...dashboardData(), error: 'Category name is required.', success: null, page: 'admin' });
  }

  let slug = slugify(name);
  if (!slug) {
    return res.render('admin/dashboard', { ...dashboardData(), error: 'Please use a category name with letters or numbers.', success: null, page: 'admin' });
  }

  // ensure slug uniqueness
  let finalSlug = slug;
  let n = 2;
  while (db.prepare('SELECT id FROM categories WHERE slug = ?').get(finalSlug)) {
    finalSlug = `${slug}-${n}`;
    n++;
  }

  const maxPos = db.prepare('SELECT MAX(position) AS m FROM categories').get().m;
  const position = (maxPos === null ? 0 : maxPos + 1);

  try {
    db.prepare('INSERT INTO categories (name, slug, position) VALUES (?, ?, ?)').run(name.trim(), finalSlug, position);
  } catch (err) {
    return res.render('admin/dashboard', { ...dashboardData(), error: 'That category already exists.', success: null, page: 'admin' });
  }

  res.redirect('/admin');
});

router.post('/categories/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// ---------- Artworks ----------

function titleFromFilename(filename) {
  const base = path.parse(filename).name;
  const spaced = base.replace(/[-_]+/g, ' ').trim();
  return spaced
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Untitled';
}

router.post('/artworks', requireAdmin, upload.single('image'), (req, res) => {
  const { title, description, dimensions, material, price_retail, price_bulk_packaging, price_bulk_no_packaging } = req.body;
  const categoryIds = normalizeCategoryIds(req.body.category_ids);

  if (!title || !req.file) {
    return res.render('admin/dashboard', {
      ...dashboardData(), error: 'Title and image are required.', success: null, page: 'admin'
    });
  }

  const maxPos = db.prepare('SELECT MAX(position) AS m FROM artworks').get().m;
  const position = (maxPos === null ? 0 : maxPos + 1);

  const result = db.prepare(`
    INSERT INTO artworks (title, description, image_path, dimensions, material, price_retail, price_bulk_packaging, price_bulk_no_packaging, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title.trim(),
    (description || '').trim(),
    `/uploads/${req.file.filename}`,
    (dimensions || '').trim() || '8.5" x 11"',
    (material || '').trim(),
    parseFloat(price_retail) || 45.00,
    parseFloat(price_bulk_packaging) || 30.00,
    parseFloat(price_bulk_no_packaging) || 25.00,
    position
  );

  if (categoryIds.length) setArtworkCategories(result.lastInsertRowid, categoryIds);

  res.redirect('/admin');
});

router.post('/artworks/bulk', requireAdmin, upload.array('images', 60), (req, res) => {
  const { description, dimensions, material, price_retail, price_bulk_packaging, price_bulk_no_packaging } = req.body;
  const categoryIds = normalizeCategoryIds(req.body.category_ids);

  if (!req.files || req.files.length === 0) {
    return res.render('admin/dashboard', {
      ...dashboardData(), error: 'Please choose at least one image to bulk add.', success: null, page: 'admin'
    });
  }

  const maxPos = db.prepare('SELECT MAX(position) AS m FROM artworks').get().m;
  let position = (maxPos === null ? 0 : maxPos + 1);

  const insert = db.prepare(`
    INSERT INTO artworks (title, description, image_path, dimensions, material, price_retail, price_bulk_packaging, price_bulk_no_packaging, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  req.files.forEach(file => {
    const result = insert.run(
      titleFromFilename(file.originalname),
      (description || '').trim(),
      `/uploads/${file.filename}`,
      (dimensions || '').trim() || '8.5" x 11"',
      (material || '').trim(),
      parseFloat(price_retail) || 45.00,
      parseFloat(price_bulk_packaging) || 30.00,
      parseFloat(price_bulk_no_packaging) || 25.00,
      position
    );
    position++;
    if (categoryIds.length) setArtworkCategories(result.lastInsertRowid, categoryIds);
  });

  res.redirect(`/admin?bulkAdded=${req.files.length}`);
});

router.get('/artworks/:id/edit', requireAdmin, (req, res) => {
  const artwork = db.prepare('SELECT * FROM artworks WHERE id = ?').get(req.params.id);
  if (!artwork) return res.redirect('/admin');

  const categories = db.prepare('SELECT * FROM categories ORDER BY position ASC, name ASC').all();
  const selectedIds = db.prepare('SELECT category_id FROM artwork_categories WHERE artwork_id = ?')
    .all(artwork.id).map(r => r.category_id);

  res.render('admin/edit-artwork', { artwork, categories, selectedIds, error: null, page: 'admin' });
});

// Reorder: expects { orderedIds: [3, 1, 2, ...] } lowest index = top of gallery
// IMPORTANT: this must be registered BEFORE the generic '/artworks/:id' route below,
// otherwise Express matches "reorder" as if it were an :id and this handler never runs.
router.post('/artworks/reorder', requireAdmin, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'Invalid payload.' });

  const update = db.prepare('UPDATE artworks SET position = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((id, index) => update.run(index, id));
  });
  tx(orderedIds);

  res.json({ ok: true });
});

router.post('/artworks/:id', requireAdmin, upload.single('image'), (req, res) => {
  const artwork = db.prepare('SELECT * FROM artworks WHERE id = ?').get(req.params.id);
  if (!artwork) return res.redirect('/admin');

  const { title, description, dimensions, material, price_retail, price_bulk_packaging, price_bulk_no_packaging } = req.body;
  const categoryIds = normalizeCategoryIds(req.body.category_ids);

  if (!title || !title.trim()) {
    const categories = db.prepare('SELECT * FROM categories ORDER BY position ASC, name ASC').all();
    return res.render('admin/edit-artwork', {
      artwork, categories, selectedIds: categoryIds, error: 'Title is required.', page: 'admin'
    });
  }

  let imagePath = artwork.image_path;
  if (req.file) {
    imagePath = `/uploads/${req.file.filename}`;
    // remove old image file if it lived in our uploads folder
    const oldFile = path.join(__dirname, '..', 'data', 'uploads', path.basename(artwork.image_path));
    fs.unlink(oldFile, () => {});
  }

  db.prepare(`
    UPDATE artworks
    SET title = ?, description = ?, image_path = ?, dimensions = ?, material = ?,
        price_retail = ?, price_bulk_packaging = ?, price_bulk_no_packaging = ?
    WHERE id = ?
  `).run(
    title.trim(),
    (description || '').trim(),
    imagePath,
    (dimensions || '').trim() || '8.5" x 11"',
    (material || '').trim(),
    parseFloat(price_retail) || 45.00,
    parseFloat(price_bulk_packaging) || 30.00,
    parseFloat(price_bulk_no_packaging) || 25.00,
    artwork.id
  );

  setArtworkCategories(artwork.id, categoryIds);

  res.redirect('/admin');
});

router.post('/artworks/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM artworks WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// Move single item to very top or very bottom (used by "send to top/bottom" buttons)
router.post('/artworks/:id/move', requireAdmin, (req, res) => {
  const { direction } = req.body; // 'top' | 'bottom'
  const id = parseInt(req.params.id, 10);
  const all = db.prepare('SELECT id FROM artworks ORDER BY position ASC').all().map(r => r.id);
  const filtered = all.filter(x => x !== id);

  const newOrder = direction === 'top' ? [id, ...filtered] : [...filtered, id];

  const update = db.prepare('UPDATE artworks SET position = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((aid, index) => update.run(index, aid));
  });
  tx(newOrder);

  res.redirect('/admin');
});



// ---------- Blog posts ----------

function uniqueSlug(title, ignoreId) {
  let base = slugify(title) || 'post';
  let finalSlug = base;
  let n = 2;
  while (true) {
    const existing = db.prepare('SELECT id FROM posts WHERE slug = ?').get(finalSlug);
    if (!existing || existing.id === ignoreId) break;
    finalSlug = `${base}-${n}`;
    n++;
  }
  return finalSlug;
}

router.get('/posts/new', requireAdmin, (req, res) => {
  res.render('admin/post-form', { post: null, error: null, page: 'admin' });
});

router.post('/posts', requireAdmin, upload.single('featured_image'), (req, res) => {
  const { title, excerpt, content } = req.body;

  if (!title || !title.trim() || !req.file) {
    return res.render('admin/post-form', {
      post: null, error: 'Title and a featured image are required.', page: 'admin'
    });
  }

  const slug = uniqueSlug(title.trim());
  const finalExcerpt = (excerpt || '').trim() || excerptFromHtml(content);

  db.prepare(`
    INSERT INTO posts (title, slug, featured_image, excerpt, content, published_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(
    title.trim(),
    slug,
    `/uploads/${req.file.filename}`,
    finalExcerpt,
    content || ''
  );

  res.redirect('/admin');
});

router.get('/posts/:id/edit', requireAdmin, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.redirect('/admin');
  res.render('admin/post-form', { post, error: null, page: 'admin' });
});

router.post('/posts/:id', requireAdmin, upload.single('featured_image'), (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.redirect('/admin');

  const { title, excerpt, content } = req.body;
  if (!title || !title.trim()) {
    return res.render('admin/post-form', { post, error: 'Title is required.', page: 'admin' });
  }

  let featuredImage = post.featured_image;
  if (req.file) {
    featuredImage = `/uploads/${req.file.filename}`;
    const oldFile = path.join(__dirname, '..', 'data', 'uploads', path.basename(post.featured_image));
    fs.unlink(oldFile, () => {});
  }

  const slug = title.trim() === post.title ? post.slug : uniqueSlug(title.trim(), post.id);
  const finalExcerpt = (excerpt || '').trim() || excerptFromHtml(content);

  db.prepare(`
    UPDATE posts SET title = ?, slug = ?, featured_image = ?, excerpt = ?, content = ?
    WHERE id = ?
  `).run(title.trim(), slug, featuredImage, finalExcerpt, content || '', post.id);

  res.redirect('/admin');
});

router.post('/posts/:id/delete', requireAdmin, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (post) {
    const oldFile = path.join(__dirname, '..', 'data', 'uploads', path.basename(post.featured_image));
    fs.unlink(oldFile, () => {});
  }
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

module.exports = router;
