const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const name = `art-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, name);
  }
});

function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPG, PNG, or WEBP images are allowed.'));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

// Multer's own error-handling doesn't always cleanly reach Express's global
// error middleware (its internal stream-abort behavior on fileSize limits
// bypasses the normal next(err) chain in some cases). Wrapping each upload
// call like this is the officially recommended, reliable way to catch it.
function withUploadErrorHandling(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        console.error('Upload error:', err.message);
        let message = 'Something went wrong with that upload. Please try again.';
        if (err.code === 'LIMIT_FILE_SIZE') {
          message = 'One of those images was too large (25MB limit per photo). Please resize it and try again.';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          message = 'Too many images selected at once. Please try a smaller batch.';
        } else if (err.message) {
          message = err.message;
        }
        return res.redirect('/admin?uploadError=' + encodeURIComponent(message));
      }
      next();
    });
  };
}

module.exports = { upload, withUploadErrorHandling };
