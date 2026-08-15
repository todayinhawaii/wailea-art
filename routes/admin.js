const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const db = require('../db');
const { upload, uploadPostMedia, uploadCsv, withUploadErrorHandling } = require('../lib/upload');
const requireAdmin = require('../lib/requireAdmin');
const slugify = require('../lib/slugify');
const excerptFromHtml = require('../lib/excerpt');
const detectOrientation = require('../lib/detectOrientation');
const { splitUploadedFile, createPreview, originalsDir } = require('../lib/imagePreview');

let mailTransporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.privateemail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
}

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

function getStoreProductsWithCategories(filter) {
  const products = filter === 'uncategorized'
    ? db.prepare(`
        SELECT * FROM store_products
        WHERE published = 1
          AND id NOT IN (SELECT DISTINCT product_id FROM store_product_categories)
        ORDER BY position ASC
      `).all()
    : db.prepare('SELECT * FROM store_products WHERE published = 1 ORDER BY position ASC').all();
  const catStmt = db.prepare(`
    SELECT c.id, c.name FROM store_categories c
    JOIN store_product_categories pc ON pc.category_id = c.id
    WHERE pc.product_id = ?
    ORDER BY c.name ASC
  `);
  return products.map(p => ({ ...p, categories: catStmt.all(p.id) }));
}

function setStoreProductCategories(productId, categoryIds) {
  db.prepare('DELETE FROM store_product_categories WHERE product_id = ?').run(productId);
  const insert = db.prepare('INSERT OR IGNORE INTO store_product_categories (product_id, category_id) VALUES (?, ?)');
  const tx = db.transaction((ids) => {
    ids.forEach(cid => insert.run(productId, cid));
  });
  tx(categoryIds);
}

function uniqueStoreProductSlug(title, ignoreId) {
  let base = slugify(title) || 'product';
  let finalSlug = base;
  let n = 2;
  while (true) {
    const existing = db.prepare('SELECT id FROM store_products WHERE slug = ?').get(finalSlug);
    if (!existing || existing.id === ignoreId) break;
    finalSlug = `${base}-${n}`;
    n++;
  }
  return finalSlug;
}

function getStoreAllPillPosition() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'store_all_pill_position'").get();
  return row ? parseInt(row.value, 10) : 0;
}

function isStoreComingSoon() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'store_coming_soon'").get();
  return !!row && row.value === '1';
}

function buildStorePillOrder(categories, allPosition) {
  const merged = categories.map(c => ({ isAll: false, id: c.id, name: c.name, slug: c.slug }));
  const clamped = Math.max(0, Math.min(allPosition, merged.length));
  merged.splice(clamped, 0, { isAll: true, id: 'all', name: 'All' });
  return merged;
}

function getAllPillPosition() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'all_pill_position'").get();
  return row ? parseInt(row.value, 10) : 0;
}

function buildPillOrder(categories, allPosition) {
  const merged = categories.map(c => ({ isAll: false, id: c.id, name: c.name, slug: c.slug }));
  const clamped = Math.max(0, Math.min(allPosition, merged.length));
  merged.splice(clamped, 0, { isAll: true, id: 'all', name: 'All' });
  return merged;
}

function uniqueArtworkSlug(title, ignoreId) {
  let base = slugify(title) || 'art';
  let finalSlug = base;
  let n = 2;
  while (true) {
    const existing = db.prepare('SELECT id FROM artworks WHERE slug = ?').get(finalSlug);
    if (!existing || existing.id === ignoreId) break;
    finalSlug = `${base}-${n}`;
    n++;
  }
  return finalSlug;
}

function dashboardData(options = {}) {
  const pendingSearch = (options.pendingSearch || '').trim();
  const pendingPage = Math.max(1, parseInt(options.pendingPage, 10) || 1);
  const pendingPerPage = 25;

  const categories = db.prepare('SELECT * FROM categories ORDER BY position ASC, name ASC').all();
  const storeCategories = db.prepare('SELECT * FROM store_categories ORDER BY position ASC, name ASC').all();
  const unprotectedCount = db.prepare('SELECT COUNT(*) AS c FROM artworks WHERE original_path IS NULL').get().c
    + db.prepare('SELECT COUNT(*) AS c FROM artwork_images WHERE original_path IS NULL').get().c;

  const searchClause = pendingSearch ? "AND title LIKE ?" : "";
  const searchParam = pendingSearch ? [`%${pendingSearch}%`] : [];

  const printifyPendingCount = db.prepare("SELECT COUNT(*) AS c FROM store_products WHERE source = 'printify' AND published = 0").get().c;
  const printifyPendingFilteredCount = db.prepare(
    `SELECT COUNT(*) AS c FROM store_products WHERE source = 'printify' AND published = 0 ${searchClause}`
  ).get(...searchParam).c;
  const totalPendingPages = Math.max(1, Math.ceil(printifyPendingFilteredCount / pendingPerPage));
  const clampedPage = Math.min(pendingPage, totalPendingPages);
  const offset = (clampedPage - 1) * pendingPerPage;

  return {
    artworks: getArtworksWithCategories(),
    categories,
    pillOrder: buildPillOrder(categories, getAllPillPosition()),
    storeCategories,
    storeProducts: getStoreProductsWithCategories(options.storeFilter),
    storeFilter: options.storeFilter === 'uncategorized' ? 'uncategorized' : null,
    uncategorizedStoreCount: db.prepare(`
      SELECT COUNT(*) AS c FROM store_products
      WHERE published = 1
        AND id NOT IN (SELECT DISTINCT product_id FROM store_product_categories)
    `).get().c,
    storePillOrder: buildStorePillOrder(storeCategories, getStoreAllPillPosition()),
    storeComingSoon: isStoreComingSoon(),
    printifyConnected: !!db.prepare("SELECT value FROM settings WHERE key = 'printify_shop_id'").get(),
    printifyShopTitle: (db.prepare("SELECT value FROM settings WHERE key = 'printify_shop_title'").get() || {}).value || '',
    printifyConfigured: printify.isConfigured(),
    printifyPendingCount,
    printifyPendingFilteredCount,
    pendingSearch,
    pendingPage: clampedPage,
    totalPendingPages,
    printifyPendingProducts: db.prepare(
      `SELECT * FROM store_products WHERE source = 'printify' AND published = 0 ${searchClause} ORDER BY id DESC LIMIT ? OFFSET ?`
    ).all(...searchParam, pendingPerPage, offset)
      .map(p => ({
        ...p,
        selectedCategoryIds: db.prepare('SELECT category_id FROM store_product_categories WHERE product_id = ?').all(p.id).map(r => r.category_id)
      })),
    messages: db.prepare(`
      SELECT * FROM messages
      WHERE email NOT IN (SELECT email FROM blocked_emails)
      ORDER BY created_at DESC LIMIT 20
    `).all(),
    blockedEmails: db.prepare('SELECT * FROM blocked_emails ORDER BY blocked_at DESC').all(),
    posts: db.prepare('SELECT * FROM posts ORDER BY position ASC, published_at DESC').all(),
    unprotectedCount
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
  const migrated = parseInt(req.query.migrated, 10);
  const remaining = parseInt(req.query.remaining, 10);
  let success = null;
  let autoContinueProtection = false;

  if (bulkAdded) {
    success = `Added ${bulkAdded} piece${bulkAdded === 1 ? '' : 's'} to your gallery. Click "Edit" on each to add a title, description, or categories.`;
  } else if (!isNaN(migrated)) {
    if (migrated === 0 && (isNaN(remaining) || remaining === 0)) {
      success = 'Everything is already protected — no unprotected images found.';
    } else if (!isNaN(remaining) && remaining > 0) {
      success = `Protected ${migrated} image${migrated === 1 ? '' : 's'} so far — ${remaining} more to go, continuing automatically…`;
      autoContinueProtection = true;
    } else {
      success = `All done! Every image is now protected — full-resolution originals are private.`;
    }
  } else if (req.query.printifyConnected) {
    success = 'Connected to your Printify shop! Click "Sync from Printify" to pull in your products.';
  } else if (req.query.printifySynced !== undefined) {
    const synced = parseInt(req.query.printifySynced, 10) || 0;
    const updated = parseInt(req.query.printifyUpdated, 10) || 0;
    if (synced === 0 && updated === 0) {
      success = 'Sync complete — no new or changed products found.';
    } else {
      success = `Synced from Printify: ${synced} new product${synced === 1 ? '' : 's'} to review` + (updated ? `, ${updated} existing updated.` : '.');
    }
  }

  const uploadError = req.query.uploadError ? decodeURIComponent(req.query.uploadError) : null;

  res.render('admin/dashboard', {
    ...dashboardData({ pendingSearch: req.query.pendingSearch, pendingPage: req.query.pendingPage, storeFilter: req.query.storeFilter }),
    error: uploadError, success, autoContinueProtection, page: 'admin'
  });
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

// Reorder categories AND the "All" pill together.
// Expects { orderedItems: ["all", "3", "1", "2", ...] } — position in the
// array is the display order; "all" can appear anywhere in that list.
router.post('/categories/reorder', requireAdmin, (req, res) => {
  const { orderedItems } = req.body;
  if (!Array.isArray(orderedItems)) return res.status(400).json({ error: 'Invalid payload.' });

  const allIndex = orderedItems.findIndex(item => item === 'all');
  const categoryIds = orderedItems.filter(item => item !== 'all').map(id => parseInt(id, 10));

  const update = db.prepare('UPDATE categories SET position = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((id, index) => update.run(index, id));
  });
  tx(categoryIds);

  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('all_pill_position', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(allIndex === -1 ? 0 : allIndex));

  res.json({ ok: true });
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

router.post('/artworks', requireAdmin, withUploadErrorHandling(upload.single('image')), async (req, res) => {
  const { title, description, sku, dimensions, material, price_retail, price_bulk_packaging, price_bulk_no_packaging } = req.body;
  const categoryIds = normalizeCategoryIds(req.body.category_ids);
  const shipsAsCanvas = req.body.ships_as_canvas ? 1 : 0;

  if (!title || !req.file) {
    return res.render('admin/dashboard', {
      ...dashboardData(), error: 'Title and image are required.', success: null, page: 'admin'
    });
  }

  try {
    const maxPos = db.prepare('SELECT MAX(position) AS m FROM artworks').get().m;
    const position = (maxPos === null ? 0 : maxPos + 1);
    const orientation = detectOrientation(req.file.path);
    const { imagePath, originalFilename } = await splitUploadedFile(req.file);
    const slug = uniqueArtworkSlug(title.trim());

    const result = db.prepare(`
      INSERT INTO artworks (title, description, image_path, original_path, slug, sku, dimensions, material, orientation, ships_as_canvas, price_retail, price_bulk_packaging, price_bulk_no_packaging, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title.trim(),
      (description || '').trim(),
      imagePath,
      originalFilename,
      slug,
      (sku || '').trim(),
      (dimensions || '').trim() || '8.5" x 11"',
      (material || '').trim(),
      orientation,
      shipsAsCanvas,
      parseFloat(price_retail) || 45.00,
      parseFloat(price_bulk_packaging) || 30.00,
      parseFloat(price_bulk_no_packaging) || 25.00,
      position
    );

    if (categoryIds.length) setArtworkCategories(result.lastInsertRowid, categoryIds);

    res.redirect('/admin');
  } catch (err) {
    console.error('Error processing uploaded image:', err);
    res.redirect('/admin?uploadError=' + encodeURIComponent('Could not process that image. Please try a different file.'));
  }
});

router.post('/artworks/bulk', requireAdmin, withUploadErrorHandling(upload.array('images', 60)), async (req, res) => {
  const { description, dimensions, material, price_retail, price_bulk_packaging, price_bulk_no_packaging } = req.body;
  const categoryIds = normalizeCategoryIds(req.body.category_ids);
  const shipsAsCanvas = req.body.ships_as_canvas ? 1 : 0;

  if (!req.files || req.files.length === 0) {
    return res.render('admin/dashboard', {
      ...dashboardData(), error: 'Please choose at least one image to bulk add.', success: null, page: 'admin'
    });
  }

  try {
    const maxPos = db.prepare('SELECT MAX(position) AS m FROM artworks').get().m;
    let position = (maxPos === null ? 0 : maxPos + 1);

    const insert = db.prepare(`
      INSERT INTO artworks (title, description, image_path, original_path, slug, dimensions, material, orientation, ships_as_canvas, price_retail, price_bulk_packaging, price_bulk_no_packaging, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const file of req.files) {
      const orientation = detectOrientation(file.path);
      const { imagePath, originalFilename } = await splitUploadedFile(file);
      const pieceTitle = titleFromFilename(file.originalname);
      const slug = uniqueArtworkSlug(pieceTitle);

      const result = insert.run(
        pieceTitle,
        (description || '').trim(),
        imagePath,
        originalFilename,
        slug,
        (dimensions || '').trim() || '8.5" x 11"',
        (material || '').trim(),
        orientation,
        shipsAsCanvas,
        parseFloat(price_retail) || 45.00,
        parseFloat(price_bulk_packaging) || 30.00,
        parseFloat(price_bulk_no_packaging) || 25.00,
        position
      );
      position++;
      if (categoryIds.length) setArtworkCategories(result.lastInsertRowid, categoryIds);
    }

    res.redirect(`/admin?bulkAdded=${req.files.length}`);
  } catch (err) {
    console.error('Error processing bulk upload:', err);
    res.redirect('/admin?uploadError=' + encodeURIComponent('Something went wrong processing those images. Please try again.'));
  }
});

router.get('/artworks/:id/edit', requireAdmin, (req, res) => {
  const artwork = db.prepare('SELECT * FROM artworks WHERE id = ?').get(req.params.id);
  if (!artwork) return res.redirect('/admin');

  const categories = db.prepare('SELECT * FROM categories ORDER BY position ASC, name ASC').all();
  const selectedIds = db.prepare('SELECT category_id FROM artwork_categories WHERE artwork_id = ?')
    .all(artwork.id).map(r => r.category_id);
  const extraImages = db.prepare('SELECT * FROM artwork_images WHERE artwork_id = ? ORDER BY position ASC')
    .all(artwork.id);

  res.render('admin/edit-artwork', { artwork, categories, selectedIds, extraImages, error: null, page: 'admin' });
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

// Same important note as above: must stay registered before '/artworks/:id'.
router.post('/artworks/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No pieces selected.' });

  const validIds = ids.map(id => parseInt(id, 10)).filter(Number.isInteger);

  const deleteOne = db.transaction((artworkId) => {
    const extraImages = db.prepare('SELECT * FROM artwork_images WHERE artwork_id = ?').all(artworkId);
    extraImages.forEach(img => {
      const filePath = path.join(__dirname, '..', 'data', 'uploads', path.basename(img.image_path));
      fs.unlink(filePath, () => {});
      if (img.original_path) {
        fs.unlink(path.join(originalsDir, path.basename(img.original_path)), () => {});
      }
    });

    const artwork = db.prepare('SELECT * FROM artworks WHERE id = ?').get(artworkId);
    if (artwork) {
      const mainFilePath = path.join(__dirname, '..', 'data', 'uploads', path.basename(artwork.image_path));
      fs.unlink(mainFilePath, () => {});
      if (artwork.original_path) {
        fs.unlink(path.join(originalsDir, path.basename(artwork.original_path)), () => {});
      }
    }

    db.prepare('DELETE FROM artwork_images WHERE artwork_id = ?').run(artworkId);
    db.prepare('DELETE FROM artwork_categories WHERE artwork_id = ?').run(artworkId);
    db.prepare('DELETE FROM artworks WHERE id = ?').run(artworkId);
  });

  validIds.forEach(id => deleteOne(id));

  res.json({ ok: true, deleted: validIds.length });
});

router.post('/artworks/:id', requireAdmin, withUploadErrorHandling(upload.single('image')), async (req, res) => {
  const artwork = db.prepare('SELECT * FROM artworks WHERE id = ?').get(req.params.id);
  if (!artwork) return res.redirect('/admin');

  const { title, description, sku, dimensions, material, price_retail, price_bulk_packaging, price_bulk_no_packaging } = req.body;
  const categoryIds = normalizeCategoryIds(req.body.category_ids);
  const shipsAsCanvas = req.body.ships_as_canvas ? 1 : 0;

  if (!title || !title.trim()) {
    const categories = db.prepare('SELECT * FROM categories ORDER BY position ASC, name ASC').all();
    const extraImages = db.prepare('SELECT * FROM artwork_images WHERE artwork_id = ? ORDER BY position ASC').all(artwork.id);
    return res.render('admin/edit-artwork', {
      artwork, categories, selectedIds: categoryIds, extraImages, error: 'Title is required.', page: 'admin'
    });
  }

  try {
    let imagePath = artwork.image_path;
    let originalPath = artwork.original_path;
    let orientation = artwork.orientation;

    if (req.file) {
      orientation = detectOrientation(req.file.path);
      const split = await splitUploadedFile(req.file);
      imagePath = split.imagePath;
      originalPath = split.originalFilename;

      // remove old preview file
      const oldPreview = path.join(__dirname, '..', 'data', 'uploads', path.basename(artwork.image_path));
      fs.unlink(oldPreview, () => {});
      // remove old private original, if one exists
      if (artwork.original_path) {
        const oldOriginal = path.join(originalsDir, path.basename(artwork.original_path));
        fs.unlink(oldOriginal, () => {});
      }
    }

    const slug = title.trim() === artwork.title ? (artwork.slug || uniqueArtworkSlug(title.trim(), artwork.id)) : uniqueArtworkSlug(title.trim(), artwork.id);

    db.prepare(`
      UPDATE artworks
      SET title = ?, description = ?, image_path = ?, original_path = ?, slug = ?, sku = ?, dimensions = ?, material = ?, orientation = ?, ships_as_canvas = ?,
          price_retail = ?, price_bulk_packaging = ?, price_bulk_no_packaging = ?
      WHERE id = ?
    `).run(
      title.trim(),
      (description || '').trim(),
      imagePath,
      originalPath,
      slug,
      (sku || '').trim(),
      (dimensions || '').trim() || '8.5" x 11"',
      (material || '').trim(),
      orientation,
      shipsAsCanvas,
      parseFloat(price_retail) || 45.00,
      parseFloat(price_bulk_packaging) || 30.00,
      parseFloat(price_bulk_no_packaging) || 25.00,
      artwork.id
    );

    setArtworkCategories(artwork.id, categoryIds);

    res.redirect('/admin');
  } catch (err) {
    console.error('Error processing edited artwork image:', err);
    res.redirect('/admin?uploadError=' + encodeURIComponent('Could not process that image. Please try a different file.'));
  }
});

router.post('/artworks/:id/publish', requireAdmin, (req, res) => {
  db.prepare('UPDATE artworks SET published = 1 WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

router.post('/artworks/:id/unpublish', requireAdmin, (req, res) => {
  db.prepare('UPDATE artworks SET published = 0 WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

router.post('/artworks/:id/delete', requireAdmin, (req, res) => {
  const artwork = db.prepare('SELECT * FROM artworks WHERE id = ?').get(req.params.id);
  const extraImages = db.prepare('SELECT * FROM artwork_images WHERE artwork_id = ?').all(req.params.id);
  extraImages.forEach(img => {
    const filePath = path.join(__dirname, '..', 'data', 'uploads', path.basename(img.image_path));
    fs.unlink(filePath, () => {});
    if (img.original_path) {
      fs.unlink(path.join(originalsDir, path.basename(img.original_path)), () => {});
    }
  });
  if (artwork) {
    const mainFilePath = path.join(__dirname, '..', 'data', 'uploads', path.basename(artwork.image_path));
    fs.unlink(mainFilePath, () => {});
    if (artwork.original_path) {
      fs.unlink(path.join(originalsDir, path.basename(artwork.original_path)), () => {});
    }
  }
  db.prepare('DELETE FROM artwork_images WHERE artwork_id = ?').run(req.params.id);
  db.prepare('DELETE FROM artwork_categories WHERE artwork_id = ?').run(req.params.id);
  db.prepare('DELETE FROM artworks WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// ---------- Carousel images (additional photos per artwork) ----------

router.post('/artworks/:id/images', requireAdmin, withUploadErrorHandling(upload.array('extra_images', 10)), async (req, res) => {
  const artwork = db.prepare('SELECT * FROM artworks WHERE id = ?').get(req.params.id);
  if (!artwork) return res.redirect('/admin');

  try {
    if (req.files && req.files.length) {
      const maxPos = db.prepare('SELECT MAX(position) AS m FROM artwork_images WHERE artwork_id = ?').get(artwork.id).m;
      let position = (maxPos === null ? 0 : maxPos + 1);
      const insert = db.prepare('INSERT INTO artwork_images (artwork_id, image_path, original_path, position) VALUES (?, ?, ?, ?)');
      for (const file of req.files) {
        const { imagePath, originalFilename } = await splitUploadedFile(file);
        insert.run(artwork.id, imagePath, originalFilename, position);
        position++;
      }
    }

    res.redirect(`/admin/artworks/${artwork.id}/edit`);
  } catch (err) {
    console.error('Error processing carousel image upload:', err);
    res.redirect('/admin?uploadError=' + encodeURIComponent('Could not process one of those images. Please try again.'));
  }
});

router.post('/artworks/:id/images/:imageId/delete', requireAdmin, (req, res) => {
  const image = db.prepare('SELECT * FROM artwork_images WHERE id = ? AND artwork_id = ?')
    .get(req.params.imageId, req.params.id);
  if (image) {
    const filePath = path.join(__dirname, '..', 'data', 'uploads', path.basename(image.image_path));
    fs.unlink(filePath, () => {});
    if (image.original_path) {
      fs.unlink(path.join(originalsDir, path.basename(image.original_path)), () => {});
    }
    db.prepare('DELETE FROM artwork_images WHERE id = ?').run(image.id);
  }
  res.redirect(`/admin/artworks/${req.params.id}/edit`);
});

// ---------- Download full-resolution originals (admin only, never public) ----------

router.get('/artworks/:id/original', requireAdmin, (req, res) => {
  const artwork = db.prepare('SELECT * FROM artworks WHERE id = ?').get(req.params.id);
  if (!artwork) return res.redirect('/admin');

  let filename = (artwork.original_path && artwork.original_path !== 'missing')
    ? path.join(originalsDir, path.basename(artwork.original_path))
    : path.join(__dirname, '..', 'data', 'uploads', path.basename(artwork.image_path));

  if (!fs.existsSync(filename)) {
    filename = path.join(__dirname, '..', 'data', 'uploads', path.basename(artwork.image_path));
  }

  res.download(filename, `${slugify(artwork.title) || 'artwork'}-original${path.extname(filename)}`);
});

router.get('/artworks/:id/images/:imageId/original', requireAdmin, (req, res) => {
  const image = db.prepare('SELECT * FROM artwork_images WHERE id = ? AND artwork_id = ?')
    .get(req.params.imageId, req.params.id);
  if (!image) return res.redirect('/admin');

  let filename = (image.original_path && image.original_path !== 'missing')
    ? path.join(originalsDir, path.basename(image.original_path))
    : path.join(__dirname, '..', 'data', 'uploads', path.basename(image.image_path));

  if (!fs.existsSync(filename)) {
    filename = path.join(__dirname, '..', 'data', 'uploads', path.basename(image.image_path));
  }

  res.download(filename, `carousel-image-original${path.extname(filename)}`);
});

// One-time migration: for art added before this feature existed, generates a
// preview from the current (full-res, currently public) file and moves that
// original file into the private folder — so existing pieces get the same
// protection without needing to be manually re-uploaded.
router.post('/regenerate-previews', requireAdmin, async (req, res) => {
  // Process for a fixed TIME budget rather than a fixed count of images —
  // real photos vary a lot in size, so a count-based batch can still be too
  // slow for some images and too conservative for others. Stopping based on
  // elapsed time instead keeps every single request safely short, no matter
  // how large or slow any particular photo turns out to be.
  const MAX_BATCH_TIME_MS = 10000; // 10 seconds
  const MAX_IMAGES_PER_REQUEST = 15; // sharp is fast/light enough to safely handle more per click
  const startTime = Date.now();
  const timeIsUp = () => Date.now() - startTime > MAX_BATCH_TIME_MS;

  async function processOne(table, row) {
    const currentFile = path.join(__dirname, '..', 'data', 'uploads', path.basename(row.image_path));
    if (!fs.existsSync(currentFile)) {
      db.prepare(`UPDATE ${table} SET original_path = ? WHERE id = ?`).run('missing', row.id);
      return;
    }

    const originalFilename = `migrated-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(currentFile)}`;
    const originalDest = path.join(originalsDir, originalFilename);
    const previewFilename = `preview-${originalFilename}`;
    const previewDest = path.join(__dirname, '..', 'data', 'uploads', previewFilename);

    await createPreview(currentFile, previewDest);
    fs.renameSync(currentFile, originalDest);

    db.prepare(`UPDATE ${table} SET image_path = ?, original_path = ? WHERE id = ?`)
      .run(`/uploads/${previewFilename}`, originalFilename, row.id);
  }

  try {
    let processed = 0;

    const artworks = db.prepare('SELECT * FROM artworks WHERE original_path IS NULL LIMIT 200').all();
    for (const art of artworks) {
      if (timeIsUp() || processed >= MAX_IMAGES_PER_REQUEST) break;
      await processOne('artworks', art);
      processed++;
    }

    if (!timeIsUp() && processed < MAX_IMAGES_PER_REQUEST) {
      const extraImages = db.prepare('SELECT * FROM artwork_images WHERE original_path IS NULL LIMIT 200').all();
      for (const img of extraImages) {
        if (timeIsUp() || processed >= MAX_IMAGES_PER_REQUEST) break;
        await processOne('artwork_images', img);
        processed++;
      }
    }

    const stillRemaining = db.prepare('SELECT COUNT(*) AS c FROM artworks WHERE original_path IS NULL').get().c
      + db.prepare('SELECT COUNT(*) AS c FROM artwork_images WHERE original_path IS NULL').get().c;

    res.redirect(`/admin?migrated=${processed}&remaining=${stillRemaining}`);
  } catch (err) {
    console.error('Error regenerating previews:', err);
    res.redirect('/admin?uploadError=' + encodeURIComponent('Something went wrong protecting your existing art. Please try again.'));
  }
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



const printify = require('../lib/printify');
const anthropic = require('../lib/anthropic');
const emailTemplate = require('../lib/emailTemplate');
const imapClient = require('../lib/imapClient');
const { parse: parseCsv } = require('csv-parse/sync');

// ---------- Store (Printify-ready product categories) ----------

router.post('/printify/connect', requireAdmin, async (req, res) => {
  const { shop_id, shop_title } = req.body;
  if (!shop_id) return res.redirect('/admin?uploadError=' + encodeURIComponent('Please choose a shop.'));

  db.prepare(`INSERT INTO settings (key, value) VALUES ('printify_shop_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(shop_id);
  db.prepare(`INSERT INTO settings (key, value) VALUES ('printify_shop_title', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(shop_title || '');

  res.redirect('/admin?printifyConnected=1');
});

router.post('/printify/disconnect', requireAdmin, (req, res) => {
  db.prepare(`DELETE FROM settings WHERE key IN ('printify_shop_id', 'printify_shop_title')`).run();
  res.redirect('/admin');
});

router.get('/printify/shops', requireAdmin, async (req, res) => {
  try {
    const shops = await printify.listShops();
    res.render('admin/printify-shops', { shops, error: null, page: 'admin' });
  } catch (err) {
    console.error('Printify listShops error:', err.message);
    res.render('admin/printify-shops', { shops: [], error: err.message, page: 'admin' });
  }
});

function mapPrintifyProduct(p) {
  const enabledVariants = (p.variants || []).filter(v => v.is_enabled !== false);
  const cheapestVariant = enabledVariants.sort((a, b) => (a.price || 0) - (b.price || 0))[0];
  const priceCents = cheapestVariant ? cheapestVariant.price : (p.variants && p.variants[0] ? p.variants[0].price : 0);
  const price = priceCents ? priceCents / 100 : 25.00;

  const defaultImage = (p.images || []).find(img => img.is_default) || (p.images || [])[0];
  const imagePath = defaultImage ? defaultImage.src : '';

  return {
    printifyProductId: String(p.id),
    title: p.title || 'Untitled product',
    description: (p.description || '').replace(/<[^>]*>/g, '').trim().slice(0, 500),
    imagePath,
    price
  };
}

router.post('/printify/sync', requireAdmin, async (req, res) => {
  const shopIdRow = db.prepare("SELECT value FROM settings WHERE key = 'printify_shop_id'").get();
  if (!shopIdRow) {
    return res.redirect('/admin?uploadError=' + encodeURIComponent('Connect a Printify shop first.'));
  }

  try {
    const products = await printify.listAllProducts(shopIdRow.value);
    let imported = 0;
    let updated = 0;

    const findExisting = db.prepare('SELECT id FROM store_products WHERE printify_product_id = ?');
    const insert = db.prepare(`
      INSERT INTO store_products (title, slug, description, image_path, price, position, source, published, printify_product_id)
      VALUES (?, ?, ?, ?, ?, ?, 'printify', 0, ?)
    `);
    const update = db.prepare(`
      UPDATE store_products SET title = ?, description = ?, image_path = ?, price = ?
      WHERE printify_product_id = ?
    `);

    for (const raw of products) {
      const mapped = mapPrintifyProduct(raw);
      if (!mapped.imagePath) continue; // skip products with no usable image

      const existing = findExisting.get(mapped.printifyProductId);
      if (existing) {
        update.run(mapped.title, mapped.description, mapped.imagePath, mapped.price, mapped.printifyProductId);
        updated++;
      } else {
        const maxPos = db.prepare('SELECT MAX(position) AS m FROM store_products').get().m;
        const position = (maxPos === null ? 0 : maxPos + 1);
        const slug = uniqueStoreProductSlug(mapped.title);
        insert.run(mapped.title, slug, mapped.description, mapped.imagePath, mapped.price, position, mapped.printifyProductId);
        imported++;
      }
    }

    res.redirect(`/admin?printifySynced=${imported}&printifyUpdated=${updated}`);
  } catch (err) {
    console.error('Printify sync error:', err.message);
    res.redirect('/admin?uploadError=' + encodeURIComponent('Printify sync failed: ' + err.message));
  }
});

router.post('/store-products/:id/publish', requireAdmin, (req, res) => {
  const categoryIds = normalizeCategoryIds(req.body.category_ids);
  if (categoryIds.length) setStoreProductCategories(req.params.id, categoryIds);
  db.prepare('UPDATE store_products SET published = 1 WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

router.post('/store-products/:id/unpublish', requireAdmin, (req, res) => {
  db.prepare('UPDATE store_products SET published = 0 WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

router.post('/store-coming-soon', requireAdmin, (req, res) => {
  const enabled = req.body.enabled === '1' ? '1' : '0';
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('store_coming_soon', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(enabled);
  res.redirect('/admin');
});

router.post('/store-categories', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.render('admin/dashboard', { ...dashboardData(), error: 'Store category name is required.', success: null, page: 'admin' });
  }

  let slug = slugify(name);
  if (!slug) {
    return res.render('admin/dashboard', { ...dashboardData(), error: 'Please use a category name with letters or numbers.', success: null, page: 'admin' });
  }

  let finalSlug = slug;
  let n = 2;
  while (db.prepare('SELECT id FROM store_categories WHERE slug = ?').get(finalSlug)) {
    finalSlug = `${slug}-${n}`;
    n++;
  }

  const maxPos = db.prepare('SELECT MAX(position) AS m FROM store_categories').get().m;
  const position = (maxPos === null ? 0 : maxPos + 1);

  try {
    db.prepare('INSERT INTO store_categories (name, slug, position) VALUES (?, ?, ?)').run(name.trim(), finalSlug, position);
  } catch (err) {
    return res.render('admin/dashboard', { ...dashboardData(), error: 'That store category already exists.', success: null, page: 'admin' });
  }

  res.redirect('/admin');
});

router.post('/store-categories/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM store_categories WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// Same important note as the art category reorder: must stay registered
// before any generic '/store-categories/:id' route (none exists yet, but
// keeping the same safe pattern for consistency and future-proofing).
router.post('/store-categories/reorder', requireAdmin, (req, res) => {
  const { orderedItems } = req.body;
  if (!Array.isArray(orderedItems)) return res.status(400).json({ error: 'Invalid payload.' });

  const allIndex = orderedItems.findIndex(item => item === 'all');
  const categoryIds = orderedItems.filter(item => item !== 'all').map(id => parseInt(id, 10));

  const update = db.prepare('UPDATE store_categories SET position = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((id, index) => update.run(index, id));
  });
  tx(categoryIds);

  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('store_all_pill_position', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(allIndex === -1 ? 0 : allIndex));

  res.json({ ok: true });
});

router.post('/store-products', requireAdmin, withUploadErrorHandling(upload.single('image')), async (req, res) => {
  const { title, description, sku, price } = req.body;
  const categoryIds = normalizeCategoryIds(req.body.category_ids);

  if (!title || !req.file) {
    return res.render('admin/dashboard', {
      ...dashboardData(), error: 'Title and image are required for a store product.', success: null, page: 'admin'
    });
  }

  try {
    const maxPos = db.prepare('SELECT MAX(position) AS m FROM store_products').get().m;
    const position = (maxPos === null ? 0 : maxPos + 1);
    const orientation = detectOrientation(req.file.path);
    const { imagePath, originalFilename } = await splitUploadedFile(req.file);
    const slug = uniqueStoreProductSlug(title.trim());

    const result = db.prepare(`
      INSERT INTO store_products (title, slug, sku, description, image_path, original_path, orientation, price, position, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')
    `).run(
      title.trim(),
      slug,
      (sku || '').trim(),
      (description || '').trim(),
      imagePath,
      originalFilename,
      orientation,
      parseFloat(price) || 25.00,
      position
    );

    if (categoryIds.length) setStoreProductCategories(result.lastInsertRowid, categoryIds);

    res.redirect('/admin');
  } catch (err) {
    console.error('Error processing store product image:', err);
    res.redirect('/admin?uploadError=' + encodeURIComponent('Could not process that image. Please try a different file.'));
  }
});

router.get('/store-products/:id/edit', requireAdmin, (req, res) => {
  const product = db.prepare('SELECT * FROM store_products WHERE id = ?').get(req.params.id);
  if (!product) return res.redirect('/admin');

  const storeCategories = db.prepare('SELECT * FROM store_categories ORDER BY position ASC, name ASC').all();
  const selectedIds = db.prepare('SELECT category_id FROM store_product_categories WHERE product_id = ?')
    .all(product.id).map(r => r.category_id);

  res.render('admin/edit-store-product', { product, storeCategories, selectedIds, error: null, page: 'admin' });
});

// IMPORTANT: must stay registered before the generic '/store-products/:id' route.
router.post('/store-products/reorder', requireAdmin, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'Invalid payload.' });

  const update = db.prepare('UPDATE store_products SET position = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((id, index) => update.run(index, id));
  });
  tx(orderedIds);

  res.json({ ok: true });
});

// IMPORTANT: must stay registered before the generic '/store-products/:id' route.
// IMPORTANT: must stay registered before the generic '/store-products/:id' route.
router.post('/store-products/:id/categories', requireAdmin, (req, res) => {
  const categoryIds = normalizeCategoryIds(req.body.category_ids);
  setStoreProductCategories(req.params.id, categoryIds);
  res.redirect('/admin');
});

router.post('/store-products/bulk-publish', requireAdmin, (req, res) => {
  const { ids, selectAllPending, categoryId, search } = req.body;

  let targetIds;
  if (selectAllPending) {
    // Operate on every pending Printify product matching the current
    // search (or all of them, if no search is active) — not just the ones
    // currently rendered on the page. This is what makes it possible to
    // publish hundreds of synced products without scrolling through them,
    // while still respecting a search like "jigsaw" if one is in use.
    const trimmedSearch = (search || '').trim();
    if (trimmedSearch) {
      targetIds = db.prepare("SELECT id FROM store_products WHERE source = 'printify' AND published = 0 AND title LIKE ?")
        .all(`%${trimmedSearch}%`).map(r => r.id);
    } else {
      targetIds = db.prepare("SELECT id FROM store_products WHERE source = 'printify' AND published = 0").all().map(r => r.id);
    }
  } else if (Array.isArray(ids)) {
    targetIds = ids.map(id => parseInt(id, 10)).filter(Number.isInteger);
  } else {
    return res.status(400).json({ error: 'No products selected.' });
  }

  if (targetIds.length === 0) {
    return res.json({ ok: true, published: 0 });
  }

  const catId = categoryId ? parseInt(categoryId, 10) : null;
  const markPublished = db.prepare('UPDATE store_products SET published = 1 WHERE id = ?');
  const addCategory = db.prepare('INSERT OR IGNORE INTO store_product_categories (product_id, category_id) VALUES (?, ?)');

  const tx = db.transaction((idList) => {
    idList.forEach(id => {
      if (catId) addCategory.run(id, catId);
      markPublished.run(id);
    });
  });
  tx(targetIds);

  res.json({ ok: true, published: targetIds.length });
});

router.post('/store-products/:id', requireAdmin, withUploadErrorHandling(upload.single('image')), async (req, res) => {
  const product = db.prepare('SELECT * FROM store_products WHERE id = ?').get(req.params.id);
  if (!product) return res.redirect('/admin');

  const { title, description, sku, price } = req.body;
  const categoryIds = normalizeCategoryIds(req.body.category_ids);

  if (!title || !title.trim()) {
    const storeCategories = db.prepare('SELECT * FROM store_categories ORDER BY position ASC, name ASC').all();
    return res.render('admin/edit-store-product', {
      product, storeCategories, selectedIds: categoryIds, error: 'Title is required.', page: 'admin'
    });
  }

  try {
    let imagePath = product.image_path;
    let originalPath = product.original_path;
    let orientation = product.orientation;

    if (req.file) {
      orientation = detectOrientation(req.file.path);
      const split = await splitUploadedFile(req.file);
      imagePath = split.imagePath;
      originalPath = split.originalFilename;

      const oldPreview = path.join(__dirname, '..', 'data', 'uploads', path.basename(product.image_path));
      fs.unlink(oldPreview, () => {});
      if (product.original_path) {
        fs.unlink(path.join(originalsDir, path.basename(product.original_path)), () => {});
      }
    }

    const slug = title.trim() === product.title ? (product.slug || uniqueStoreProductSlug(title.trim(), product.id)) : uniqueStoreProductSlug(title.trim(), product.id);

    db.prepare(`
      UPDATE store_products
      SET title = ?, slug = ?, sku = ?, description = ?, image_path = ?, original_path = ?, orientation = ?, price = ?
      WHERE id = ?
    `).run(
      title.trim(),
      slug,
      (sku || '').trim(),
      (description || '').trim(),
      imagePath,
      originalPath,
      orientation,
      parseFloat(price) || 25.00,
      product.id
    );

    setStoreProductCategories(product.id, categoryIds);

    res.redirect('/admin');
  } catch (err) {
    console.error('Error processing edited store product:', err);
    res.redirect('/admin?uploadError=' + encodeURIComponent('Could not process that image. Please try a different file.'));
  }
});

router.post('/store-products/:id/delete', requireAdmin, (req, res) => {
  const product = db.prepare('SELECT * FROM store_products WHERE id = ?').get(req.params.id);
  if (product) {
    const filePath = path.join(__dirname, '..', 'data', 'uploads', path.basename(product.image_path));
    fs.unlink(filePath, () => {});
    if (product.original_path) {
      fs.unlink(path.join(originalsDir, path.basename(product.original_path)), () => {});
    }
  }
  db.prepare('DELETE FROM store_product_categories WHERE product_id = ?').run(req.params.id);
  db.prepare('DELETE FROM store_products WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

router.get('/store-products/:id/original', requireAdmin, (req, res) => {
  const product = db.prepare('SELECT * FROM store_products WHERE id = ?').get(req.params.id);
  if (!product) return res.redirect('/admin');

  let filename = (product.original_path && product.original_path !== 'missing')
    ? path.join(originalsDir, path.basename(product.original_path))
    : path.join(__dirname, '..', 'data', 'uploads', path.basename(product.image_path));

  if (!fs.existsSync(filename)) {
    filename = path.join(__dirname, '..', 'data', 'uploads', path.basename(product.image_path));
  }

  res.download(filename, `${slugify(product.title) || 'product'}-original${path.extname(filename)}`);
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

router.post('/posts', requireAdmin, withUploadErrorHandling(uploadPostMedia.single('featured_image')), (req, res) => {
  const { title, excerpt, content } = req.body;

  if (!title || !title.trim() || !req.file) {
    return res.render('admin/post-form', {
      post: null, error: 'Title and a featured image are required.', page: 'admin'
    });
  }

  const slug = uniqueSlug(title.trim());
  const finalExcerpt = (excerpt || '').trim() || excerptFromHtml(content);
  const minPos = db.prepare('SELECT MIN(position) AS m FROM posts').get().m;
  const position = (minPos === null ? 0 : minPos - 1);

  db.prepare(`
    INSERT INTO posts (title, slug, featured_image, excerpt, content, position, published_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    title.trim(),
    slug,
    `/uploads/${req.file.filename}`,
    finalExcerpt,
    content || '',
    position
  );

  res.redirect('/admin');
});

router.get('/posts/:id/edit', requireAdmin, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.redirect('/admin');
  res.render('admin/post-form', { post, error: null, page: 'admin' });
});

// IMPORTANT: this must stay registered BEFORE the generic '/posts/:id' route
// below, otherwise Express matches "reorder" as if it were an :id and this
// handler never runs — the exact same bug we fixed for artworks reordering.
router.post('/posts/reorder', requireAdmin, (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'Invalid payload.' });

  const update = db.prepare('UPDATE posts SET position = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    ids.forEach((id, index) => update.run(index, id));
  });
  tx(orderedIds);

  res.json({ ok: true });
});

router.post('/posts/:id', requireAdmin, withUploadErrorHandling(uploadPostMedia.single('featured_image')), (req, res) => {
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

// ---------- Messages ----------

router.post('/messages/block', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No messages selected.' });

  const validIds = ids.map(id => parseInt(id, 10)).filter(Number.isInteger);
  const placeholders = validIds.map(() => '?').join(',');
  const emails = db.prepare(`SELECT DISTINCT email FROM messages WHERE id IN (${placeholders})`).all(...validIds);

  const insert = db.prepare('INSERT OR IGNORE INTO blocked_emails (email) VALUES (?)');
  const tx = db.transaction((rows) => {
    rows.forEach(r => insert.run(r.email.toLowerCase()));
  });
  tx(emails);

  res.json({ ok: true, blocked: emails.length });
});

router.post('/blocked-emails/:id/unblock', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM blocked_emails WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

router.post('/messages/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No messages selected.' });

  const validIds = ids.map(id => parseInt(id, 10)).filter(Number.isInteger);
  const del = db.prepare('DELETE FROM messages WHERE id = ?');
  const tx = db.transaction((idList) => { idList.forEach(id => del.run(id)); });
  tx(validIds);

  res.json({ ok: true, deleted: validIds.length });
});

router.post('/messages/send-email', requireAdmin, async (req, res) => {
  const { ids, subject, body } = req.body;

  if (!mailTransporter) {
    return res.status(400).json({ error: 'Email is not configured (missing SMTP_USER/SMTP_PASSWORD in Render).' });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No recipients selected.' });
  }
  if (!subject || !subject.trim() || !body || !body.trim()) {
    return res.status(400).json({ error: 'Please write a subject and message.' });
  }

  const validIds = ids.map(id => parseInt(id, 10)).filter(Number.isInteger);
  const placeholders = validIds.map(() => '?').join(',');
  const recipients = db.prepare(`SELECT DISTINCT name, email FROM messages WHERE id IN (${placeholders})`).all(...validIds);

  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    try {
      await mailTransporter.sendMail({
        from: `"Wailea Art" <${process.env.SMTP_USER}>`,
        to: r.email,
        subject: subject.trim(),
        text: body.trim(),
        html: `<p>${body.trim().replace(/\n/g, '<br>')}</p>`
      });
      sent++;
    } catch (err) {
      console.error(`Failed to send marketing email to ${r.email}:`, err.message);
      failed++;
    }
  }

  res.json({ ok: true, sent, failed, total: recipients.length });
});

// ---------- Wholesale Outreach — simple email address book ----------

function isRealEmail(value) {
  return !!value && /\S+@\S+\.\S+/.test(value);
}

router.get('/outreach', requireAdmin, (req, res) => {
  const contacts = db.prepare(`
    SELECT * FROM email_contacts
    ORDER BY (last_sent_at IS NULL) ASC, last_sent_at DESC, created_at DESC
  `).all();

  const repliesStmt = db.prepare('SELECT * FROM email_replies WHERE contact_id = ? ORDER BY received_at DESC, id DESC');
  contacts.forEach(c => { c.replies = repliesStmt.all(c.id); });

  res.render('admin/outreach', {
    contacts,
    anthropicConfigured: anthropic.isConfigured(),
    imapConfigured: imapClient.isConfigured(),
    page: 'admin'
  });
});

router.post('/outreach/check-replies', requireAdmin, async (req, res) => {
  const contacts = db.prepare('SELECT id, email FROM email_contacts').all();
  if (contacts.length === 0) return res.json({ ok: true, newReplies: 0 });

  try {
    const messages = await imapClient.checkForReplies(contacts.map(c => c.email));
    const emailToContactId = {};
    contacts.forEach(c => { emailToContactId[c.email] = c.id; });

    const insert = db.prepare(`
      INSERT OR IGNORE INTO email_replies (contact_id, message_id, from_email, subject, body, received_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let newCount = 0;
    messages.forEach(m => {
      const contactId = emailToContactId[m.fromEmail];
      if (!contactId) return;
      const result = insert.run(contactId, m.messageId, m.fromEmail, m.subject, m.body, m.receivedAt);
      if (result.changes > 0) newCount++;
    });

    res.json({ ok: true, newReplies: newCount });
  } catch (err) {
    console.error('Check replies error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/outreach/generate-draft', requireAdmin, async (req, res) => {
  const { email, label } = req.body;
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Enter a valid email address first.' });

  try {
    const draft = await anthropic.draftOutreachEmail({ email: email.trim(), label: (label || '').trim() });
    // The AI returns plain text with \n line breaks — convert to simple HTML
    // paragraphs so it loads cleanly into the rich text editor.
    const bodyHtml = draft.body
      .split(/\n\s*\n/)
      .map(para => `<p>${para.trim().replace(/\n/g, '<br>')}</p>`)
      .join('');
    res.json({ ok: true, subject: draft.subject, body: bodyHtml });
  } catch (err) {
    console.error('AI draft error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/outreach/render-preview', requireAdmin, (req, res) => {
  const { body } = req.body;
  res.send(emailTemplate.wrapInWelcomeTemplate(body || '<p>(Nothing written yet — generate or write a message to see it here.)</p>'));
});

router.post('/outreach/send', requireAdmin, async (req, res) => {
  const { email, label, subject, body, inReplyTo } = req.body;

  const plainTextBody = emailTemplate.htmlToPlainText(body);

  if (!isRealEmail(email)) return res.status(400).json({ error: 'Enter a valid email address first.' });
  if (!subject || !subject.trim() || !plainTextBody) return res.status(400).json({ error: 'Write or generate a message before sending.' });
  if (!mailTransporter) return res.status(400).json({ error: 'Email is not configured (missing SMTP_USER/SMTP_PASSWORD in Render).' });

  const cleanEmail = email.trim().toLowerCase();

  try {
    const mailOptions = {
      from: `"Wailea Art" <${process.env.SMTP_USER}>`,
      to: cleanEmail,
      replyTo: process.env.CONTACT_EMAIL || process.env.SMTP_USER,
      subject: subject.trim(),
      text: plainTextBody,
      html: emailTemplate.wrapInWelcomeTemplate(body),
      headers: {
        // A real, working opt-out signal — spam filters specifically look
        // for this on anything that reads as promotional/outreach mail,
        // and its absence can itself count against deliverability.
        'List-Unsubscribe': `<mailto:${process.env.SMTP_USER}?subject=Unsubscribe>`
      }
    };

    // If this is a reply to a specific message, set proper threading
    // headers so it shows up as part of the same conversation in the
    // recipient's inbox instead of a disconnected new email.
    if (inReplyTo) {
      mailOptions.inReplyTo = inReplyTo;
      mailOptions.references = inReplyTo;
      if (!/^re:/i.test(mailOptions.subject)) {
        mailOptions.subject = `Re: ${mailOptions.subject}`;
      }
    }

    await mailTransporter.sendMail(mailOptions);

    const existing = db.prepare('SELECT * FROM email_contacts WHERE email = ?').get(cleanEmail);
    let timesSent;
    if (existing) {
      timesSent = existing.times_sent + 1;
      db.prepare(`
        UPDATE email_contacts
        SET times_sent = ?, last_subject = ?, last_body = ?, last_sent_at = datetime('now'), label = CASE WHEN ? != '' THEN ? ELSE label END
        WHERE id = ?
      `).run(timesSent, subject.trim(), body.trim(), (label || '').trim(), (label || '').trim(), existing.id);
    } else {
      timesSent = 1;
      db.prepare(`
        INSERT INTO email_contacts (email, label, times_sent, last_subject, last_body, last_sent_at)
        VALUES (?, ?, 1, ?, ?, datetime('now'))
      `).run(cleanEmail, (label || '').trim(), subject.trim(), body.trim());
    }

    res.json({ ok: true, timesSent });
  } catch (err) {
    console.error('Outreach send error:', err.message);
    res.status(500).json({ error: 'Could not send that email. Please try again.' });
  }
});

router.post('/outreach/contacts/:id', requireAdmin, (req, res) => {
  const { email, label } = req.body;
  if (!isRealEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

  try {
    db.prepare('UPDATE email_contacts SET email = ?, label = ? WHERE id = ?')
      .run(email.trim().toLowerCase(), (label || '').trim(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'That email address is already saved for another contact.' });
  }
});

router.post('/outreach/contacts/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM email_contacts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
