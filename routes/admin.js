const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { upload, uploadPostMedia, withUploadErrorHandling } = require('../lib/upload');
const requireAdmin = require('../lib/requireAdmin');
const slugify = require('../lib/slugify');
const excerptFromHtml = require('../lib/excerpt');
const detectOrientation = require('../lib/detectOrientation');
const { splitUploadedFile, createPreview, originalsDir } = require('../lib/imagePreview');

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

function dashboardData() {
  const categories = db.prepare('SELECT * FROM categories ORDER BY position ASC, name ASC').all();
  const unprotectedCount = db.prepare('SELECT COUNT(*) AS c FROM artworks WHERE original_path IS NULL').get().c
    + db.prepare('SELECT COUNT(*) AS c FROM artwork_images WHERE original_path IS NULL').get().c;
  return {
    artworks: getArtworksWithCategories(),
    categories,
    pillOrder: buildPillOrder(categories, getAllPillPosition()),
    messages: db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 20').all(),
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
  }

  const uploadError = req.query.uploadError ? decodeURIComponent(req.query.uploadError) : null;

  res.render('admin/dashboard', { ...dashboardData(), error: uploadError, success, autoContinueProtection, page: 'admin' });
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

module.exports = router;
