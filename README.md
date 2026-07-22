# Wailea Art

A simple, modern gallery website with an admin panel and Stripe checkout.

- **Home page** — gallery grid, 3 across, unlimited rows
- **Admin panel** — add art, drag-and-drop reorder, "move to top/bottom" buttons, delete, view contact messages
- **Checkout** — Retail ($45), Bulk 10+ with packaging ($30/piece), Bulk 10+ no packaging ($25/piece) — all priced and validated server-side, then sent to Stripe Checkout
- **About & Contact pages**

---

## 1. Run it locally first (recommended)

You'll need [Node.js](https://nodejs.org) 18+ installed on your computer.

```bash
cd wailea-art
npm install
cp .env.example .env
```

Open `.env` and fill in:
- `SESSION_SECRET` — any long random string
- `ADMIN_USER` — the username you'll log in with (default `admin`)
- `ADMIN_PASS_HASH` — generate this by running:
  ```bash
  node scripts/set-admin-password.js "your-new-password"
  ```
  Copy the printed hash into `.env`.
- `STRIPE_SECRET_KEY` — from https://dashboard.stripe.com/apikeys (use a **test** key while you're setting things up, switch to your **live** key when you're ready to accept real payments)

Then start it:

```bash
npm start
```

Visit `http://localhost:3000` for the site and `http://localhost:3000/admin` for the admin panel. Add a couple of pieces of art and try the drag-and-drop reordering and the buy flow (use Stripe's test card `4242 4242 4242 4242`, any future expiry date, any CVC).

---

## 2. Push the code to GitHub

```bash
cd wailea-art
git init
git add .
git commit -m "Initial Wailea Art site"
```

Create a new **empty** repository on GitHub (no README/license, so it doesn't conflict), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/wailea-art.git
git branch -M main
git push -u origin main
```

Your `.env` file is excluded automatically (see `.gitignore`) — never commit real secrets to GitHub.

---

## 3. Deploy on Render

Since the site needs a working admin panel and live Stripe checkout, it needs to run as a small **Web Service** on Render (plain GitHub Pages can't do this — it only serves static files).

1. In Render, click **New → Web Service** and connect your `wailea-art` GitHub repo.
2. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free is fine to start (see the disk note below); Starter ($7/mo) if you want no cold-start delay
3. Under **Environment**, add the same variables from your `.env`:
   - `SITE_URL` → `https://www.wailea.art`
   - `SESSION_SECRET`
   - `ADMIN_USER`
   - `ADMIN_PASS_HASH`
   - `STRIPE_SECRET_KEY` (your live key, once you're ready to launch)
4. Click **Create Web Service**. Render will build and deploy automatically, and redeploy every time you push to GitHub.

### ⚠️ Important: persisting uploaded images

Render's filesystem resets every time you redeploy (push new code). That means uploaded artwork images — and the small database file that stores your gallery order and contact messages — would be **wiped on every deploy** unless you add a persistent disk.

To fix this, in your Render service go to **Disks → Add Disk**:
- **Mount path:** `/opt/render/project/src/data`
- **Size:** 1 GB is plenty to start (a few cents/month)

This keeps your `data/` folder (uploads + database) safe across deploys. This does require a paid instance type — Render's free tier doesn't support persistent disks. If you want to stay fully free, you'd need to re-upload your art after every code change, which isn't practical, so a Starter instance + small disk is the realistic setup for a live shop.

---

## 4. Connect your domain (www.wailea.art)

In Render, go to your service → **Settings → Custom Domains**, add `www.wailea.art`, and follow the DNS instructions shown there (usually a CNAME record pointed at your Render service). Render issues a free SSL certificate automatically once DNS is verified.

---

## 5. Go live with Stripe

While testing, use your Stripe **test** secret key so no real charges happen. When you're ready to accept real payments:
1. Finish Stripe's account activation (business details, bank account) in the Stripe dashboard.
2. Switch `STRIPE_SECRET_KEY` in Render's environment variables to your **live** secret key.
3. Redeploy (Render does this automatically when you change env vars).

---

## Notes

- The admin login only has one account (set via `ADMIN_USER` / `ADMIN_PASS_HASH`) — there's no user management screen, by design, since this is just for you.
- To change your admin password later, run `node scripts/set-admin-password.js "new-password"` again and update `ADMIN_PASS_HASH` in Render.
- Prices default to $45 / $30 / $25 when you add new art, but you can override any of the three per piece if one design should be priced differently.
- Contact form messages are stored in the database and show up at the bottom of the admin dashboard — there's no email-sending set up, so check the admin panel to see them.
