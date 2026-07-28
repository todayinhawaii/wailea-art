const express = require('express');
const router = express.Router();
const db = require('../db');
const { BULK_MIN_QTY, resolveOrder } = require('../lib/pricing');
const nodemailer = require('nodemailer');

let mailTransporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.privateemail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false, // STARTTLS on port 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
}

// Sends a notification to the shop owner whenever someone submits the
// contact form. Fails silently (just logs) so a broken email setup never
// blocks the actual form submission — the message is always saved to the
// database first, regardless of whether this succeeds.
async function sendContactNotification({ name, email, message }) {
  if (!mailTransporter) {
    console.log('Email not configured (SMTP_USER/SMTP_PASSWORD missing) — skipping notification email.');
    return;
  }

  const toAddress = process.env.CONTACT_EMAIL || process.env.SMTP_USER;

  try {
    await mailTransporter.sendMail({
      from: `"Wailea Art website" <${process.env.SMTP_USER}>`,
      to: toAddress,
      replyTo: email,
      subject: `New message from ${name} — Wailea Art contact form`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      html: `
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
        <hr>
        <p style="color:#888; font-size: 0.85em;">Reply directly to this email to respond to ${name}.</p>
      `
    });
    console.log(`Contact notification email sent successfully to ${toAddress}.`);
  } catch (err) {
    console.error('Failed to send contact notification email:', err.message);
  }
}

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// This exact list came directly from Stripe's own API (their error message
// when an invalid code is passed helpfully lists every valid one) — so this
// is guaranteed to match what Stripe currently supports for shipping.
const SHIPPABLE_COUNTRIES = [
  'AC','AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AT','AU','AW','AX','AZ',
  'BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ',
  'CA','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CV','CW','CY','CZ',
  'DE','DJ','DK','DM','DO','DZ',
  'EC','EE','EG','EH','ER','ES','ET',
  'FI','FJ','FK','FO','FR',
  'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY',
  'HK','HN','HR','HT','HU',
  'ID','IE','IL','IM','IN','IO','IQ','IS','IT',
  'JE','JM','JO','JP',
  'KE','KG','KH','KI','KM','KN','KR','KW','KY','KZ',
  'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY',
  'MA','MC','MD','ME','MF','MG','MK','ML','MM','MN','MO','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ',
  'NA','NC','NE','NG','NI','NL','NO','NP','NR','NU','NZ',
  'OM',
  'PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PY',
  'QA',
  'RE','RO','RS','RU','RW',
  'SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SZ',
  'TA','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ',
  'UA','UG','US','UY','UZ',
  'VA','VC','VE','VG','VN','VU',
  'WF','WS',
  'XK',
  'YE','YT',
  'ZA','ZM','ZW','ZZ'
];

// Flat shipping rates — easy to adjust here any time.
// Retail = a single mailed print; Bulk = a heavier box shipment (10+ pieces);
// Canvas = a single rolled canvas shipped in a protective tube.
const SHIPPING_RATES = {
  retail: 6.95,
  bulk: 24.95,
  canvas: 14.95
};

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
  sendContactNotification({ name: name.trim(), email: email.trim(), message: message.trim() });
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

router.post('/api/checkout', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Payments are not configured yet. Add STRIPE_SECRET_KEY.' });
    }

    const { artworkId, mode, packaging, quantity } = req.body;
    const artwork = db.prepare('SELECT * FROM artworks WHERE id = ?').get(artworkId);
    if (!artwork) return res.status(404).json({ error: 'Artwork not found.' });

    const resolved = resolveOrder(artwork, mode, !!packaging, quantity);
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });

    const siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;

    const shippingKey = artwork.ships_as_canvas ? 'canvas' : mode;
    const shippingLabel = artwork.ships_as_canvas
      ? 'Rolled canvas shipping'
      : (mode === 'bulk' ? 'Bulk shipping' : 'Standard shipping');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: resolved.quantity,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(resolved.unitPrice * 100),
            product_data: {
              name: `${artwork.title} — ${resolved.label}`,
              description: artwork.dimensions ? `${artwork.dimensions} art print` : 'Art print',
              images: artwork.image_path.startsWith('http')
                ? [artwork.image_path]
                : [`${siteUrl}${artwork.image_path}`]
            }
          }
        }
      ],
      // Collect a real shipping address since this is a physical, mailed product —
      // without this, Stripe only collects payment info, not where to send the art.
      shipping_address_collection: {
        allowed_countries: SHIPPABLE_COUNTRIES
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: Math.round(SHIPPING_RATES[shippingKey] * 100),
              currency: 'usd'
            },
            display_name: shippingLabel
          }
        }
      ],
      phone_number_collection: {
        enabled: true
      },
      success_url: `${siteUrl}/checkout/success`,
      cancel_url: `${siteUrl}/checkout/cancel`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Something went wrong creating your checkout session.' });
  }
});

module.exports = router;
