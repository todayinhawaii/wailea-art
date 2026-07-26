const express = require('express');
const router = express.Router();
const db = require('../db');
const { BULK_MIN_QTY } = require('../lib/pricing');

router.get('/sitemap.xml', (req, res) => {
  const siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
  const categories = db.prepare('SELECT slug FROM categories').all();
  const posts = db.prepare('SELECT slug, published_at FROM posts').all();

  const urls = [
    { loc: `${siteUrl}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${siteUrl}/about`, priority: '0.7', changefreq: 'monthly' },
    { loc: `${siteUrl}/contact`, priority: '0.6', changefreq: 'monthly' },
    { loc: `${siteUrl}/blog`, priority: '0.8', changefreq: 'weekly' }
  ];
  categories.forEach(c => {
    urls.push({ loc: `${siteUrl}/?category=${c.slug}`, priority: '0.5', changefreq: 'weekly' });
  });
  posts.forEach(p => {
    urls.push({ loc: `${siteUrl}/blog/${p.slug}`, priority: '0.6', changefreq: 'monthly' });
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')}
</urlset>`;

  res.type('application/xml').send(xml);
});

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

router.get('/blog', (req, res) => {
  const posts = db.prepare('SELECT * FROM posts ORDER BY published_at DESC').all();
  res.render('blog', { posts, page: 'blog' });
});

router.get('/blog/:slug', (req, res, next) => {
  const post = db.prepare('SELECT * FROM posts WHERE slug = ?').get(req.params.slug);
  if (!post) return next();
  res.render('post', { post, page: 'blog' });
});

router.get('/checkout/success', (req, res) => {
  res.render('checkout-result', { page: 'checkout', success: true });
});

router.get('/checkout/cancel', (req, res) => {
  res.render('checkout-result', { page: 'checkout', success: false });
});

module.exports = router;
