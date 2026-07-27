const express = require('express');
const router = express.Router();
const db = require('../db');
const { resolveOrder } = require('../lib/pricing');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Nearly every country Stripe supports for shipping. Sanctioned countries
// (Iran, North Korea, Syria, Cuba, etc.) are intentionally left out since
// Stripe/US law doesn't support transacting with them anyway.
const SHIPPABLE_COUNTRIES = [
  'AF','AX','AL','DZ','AD','AO','AI','AG','AR','AM','AW','AU','AT','AZ','BS','BH','BD','BB','BY','BE','BZ','BJ','BM','BT','BO','BA','BW','BR','BN','BG','BF','BI',
  'KH','CM','CA','CV','BQ','KY','CF','TD','CL','CN','CO','KM','CG','CD','CK','CR','CI','HR','CW','CY','CZ',
  'DK','DJ','DM','DO','EC','EG','SV','GQ','ER','EE','ET',
  'FK','FO','FJ','FI','FR','GF','PF',
  'GA','GM','GE','DE','GH','GI','GR','GL','GD','GP','GU','GT','GG','GN','GW','GY',
  'HT','HN','HK','HU',
  'IS','IN','ID','IE','IM','IL','IT',
  'JM','JP','JE','JO',
  'KZ','KE','KI','KW','KG',
  'LA','LV','LB','LS','LR','LY','LI','LT','LU',
  'MO','MK','MG','MW','MY','MV','ML','MT','MQ','MR','MU','YT','MX','MD','MC','MN','ME','MS','MA','MZ','MM',
  'NA','NR','NP','NL','NC','NZ','NI','NE','NG','NU','NF','NO',
  'OM',
  'PK','PW','PS','PA','PG','PY','PE','PH','PN','PL','PT','PR',
  'QA',
  'RE','RO','RU','RW',
  'BL','SH','KN','LC','MF','PM','VC','WS','SM','ST','SA','SN','RS','SC','SL','SG','SX','SK','SI','SB','SO','ZA','GS','KR','SS','ES','LK','SD','SR','SJ','SZ','SE','CH',
  'TW','TJ','TZ','TH','TL','TG','TK','TO','TT','TN','TR','TM','TC','TV',
  'UG','UA','AE','GB','US','UY','UZ',
  'VU','VA','VE','VN','VG','VI',
  'WF','EH',
  'YE',
  'ZM','ZW'
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
