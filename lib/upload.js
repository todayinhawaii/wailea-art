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

// A separate uploader specifically for Journal post covers, which can be
// either a still image OR a short video. Kept completely separate from the
// artwork uploader above — artwork always stays images-only, since the
// preview/original-protection pipeline is built for photos, not video.
const postMediaDir = path.join(__dirname, '..', 'data', 'uploads');
const postMediaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, postMediaDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.webm', '.mov'].includes(ext) ? ext : '.jpg';
    const name = `post-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, name);
  }
});

function postMediaFileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPG, PNG, WEBP images or MP4, WEBM, MOV videos are allowed.'));
}

const uploadPostMedia = multer({
  storage: postMediaStorage,
  fileFilter: postMediaFileFilter,
  limits: { fileSize: 80 * 1024 * 1024 } // 80MB — videos need more headroom than photos
});

// CSV uploads (outreach lead lists) are parsed in-memory and never saved
// to disk — nothing to write, so memoryStorage keeps this simple.
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Please upload a .csv file.'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB — plenty for a lead list
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
          message = 'That file was too large. Please use a smaller photo or video and try again.';
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

module.exports = { upload, uploadPostMedia, uploadCsv, withUploadErrorHandling };
