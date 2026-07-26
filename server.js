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
app.use('/api', require('./routes/api'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('404', { page: '404' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Wailea Art running on port ${PORT}`);
});
