const express = require('express');
const router = express.Router();
const db = require('../db');
const { resolveOrder } = require('../lib/pricing');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

router.post('/checkout', async (req, res) => {
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
              description: '8.5" x 11" art print',
              images: artwork.image_path.startsWith('http')
                ? [artwork.image_path]
                : [`${siteUrl}${artwork.image_path}`]
            }
          }
        }
      ],
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
