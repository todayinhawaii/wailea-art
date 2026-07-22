const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const upload = require('../lib/upload');
const requireAdmin = require('../lib/requireAdmin');

// ---------- Login ----------

router.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { error: null, page: 'admin' });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminHash = process.env.ADMIN_PASS_HASH || '';

  const validUser = username === adminUser;
  const validPass = adminHash && bcrypt.compareSync(password || '', adminHash);

  if (!validUser || !validPass) {
    return res.render('admin/login', { error: 'Incorrect username or password.', page: 'admin' });
  }

  req.session.isAdmin = true;
  res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ---------- Dashboard ----------

router.get('/', requireAdmin, (req, res) => {
  const artworks = db.prepare('SELECT * FROM artworks ORDER BY position ASC').all();
  const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 20').all();
  res.render('admin/dashboard', { artworks, messages, error: null, page: 'admin' });
});

// ---------- Artworks ----------

router.post('/artworks', requireAdmin, upload.single('image'), (req, res) => {
  const { title, description, price_retail, price_bulk_packaging, price_bulk_no_packaging } = req.body;

  if (!title || !req.file) {
    const artworks = db.prepare('SELECT * FROM artworks ORDER BY position ASC').all();
    const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 20').all();
    return res.render('admin/dashboard', {
      artworks, messages, error: 'Title and image are required.', page: 'admin'
    });
  }

  const maxPos = db.prepare('SELECT MAX(position) AS m FROM artworks').get().m;
  const position = (maxPos === null ? 0 : maxPos + 1);

  db.prepare(`
    INSERT INTO artworks (title, description, image_path, price_retail, price_bulk_packaging, price_bulk_no_packaging, position)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    title.trim(),
    (description || '').trim(),
    `/uploads/${req.file.filename}`,
    parseFloat(price_retail) || 45.00,
    parseFloat(price_bulk_packaging) || 30.00,
    parseFloat(price_bulk_no_packaging) || 25.00,
    position
  );

  res.redirect('/admin');
});

router.post('/artworks/:id/delete', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM artworks WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// Reorder: expects { orderedIds: [3, 1, 2, ...] } lowest index = top of gallery
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

module.exports = router;
