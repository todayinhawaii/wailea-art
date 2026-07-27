const express = require('express');
const router = express.Router();
const db = require('../db');
const { resolveOrder } = require('../lib/pricing');

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
// Retail = a single mailed print; Bulk = a heavier box shipment (10+ pieces).
const SHIPPING_RATES = {
  retail: 6.95,
  bulk: 24.95
};

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
              amount: Math.round(SHIPPING_RATES[mode] * 100),
              currency: 'usd'
            },
            display_name: mode === 'bulk' ? 'Bulk shipping' : 'Standard shipping'
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
