const express = require('express');
const router = express.Router();
const db = require('../db');
const { BULK_MIN_QTY } = require('../lib/pricing');

router.get('/', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY position ASC, name ASC').all();
  const activeSlug = req.query.category || null;

  let artworks;
  if (activeSlug) {
    artworks = db.prepare(`
      SELECT DISTINCT a.* FROM artworks a
      JOIN artwork_categories ac ON ac.artwork_id = a.id
      JOIN categories c ON c.id = ac.category_id
      WHERE c.slug = ?
      ORDER BY a.position ASC
    `).all(activeSlug);
  } else {
    artworks = db.prepare('SELECT * FROM artworks ORDER BY position ASC').all();
  }

  res.render('index', { artworks, categories, activeSlug, bulkMinQty: BULK_MIN_QTY, page: 'home' });
});

router.get('/about', (req, res) => {
  res.render('about', { page: 'about' });
});

router.get('/contact', (req, res) => {
  res.render('contact', { page: 'contact', sent: req.query.sent === '1' });
});

router.post('/contact', (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.render('contact', { page: 'contact', sent: false, error: 'Please fill in every field.' });
  }
  db.prepare('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)').run(
    name.trim(), email.trim(), message.trim()
  );
  res.redirect('/contact?sent=1');
});

router.get('/checkout/success', (req, res) => {
  res.render('checkout-result', { page: 'checkout', success: true });
});

router.get('/checkout/cancel', (req, res) => {
  res.render('checkout-result', { page: 'checkout', success: false });
});

module.exports = router;
