require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const app = express();

// Render (and most hosts) sit in front of the app as a reverse proxy that
// terminates HTTPS. Without this, Express can't reliably tell the connection
// is secure, which can cause login sessions to fail to "stick."
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'data', 'uploads')));

// Belt-and-suspenders fix: explicitly tell every layer between the server and
// the visitor (browser, Render's edge, any proxy) to never cache these HTML
// pages. Without this, a page update can appear "stuck" on old content even
// after a successful deploy, because nothing told the cache it was allowed
// to hold onto the response in the first place.
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 12, // 12 hours
    secure: 'auto',
    sameSite: 'lax'
  }
}));

app.use((req, res, next) => {
  res.locals.siteUrl = process.env.SITE_URL || `${req.protocol}://${req.get('host')}`;
  next();
});

app.use('/', require('./routes/public'));
app.use('/admin', (req, res, next) => {
  res.locals.noIndex = true; // never let search engines index the admin panel
  next();
});
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('404', { page: '404' });
});

// Safety net for any other unexpected error that slips through (upload
// errors are now caught right at the route level in lib/upload.js, since
// Multer's own error behavior doesn't always reach this global handler).
app.use((err, req, res, next) => {
  console.error('Request error:', err);
  const isAdmin = req.path.startsWith('/admin');
  const message = (err && err.message) || 'Something went wrong. Please try again.';

  if (isAdmin) {
    return res.redirect('/admin?uploadError=' + encodeURIComponent(message));
  }
  res.status(500).send(message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Wailea Art running on port ${PORT}`);
});
