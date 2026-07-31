const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
const originalsDir = path.join(__dirname, '..', 'data', 'originals');
if (!fs.existsSync(originalsDir)) fs.mkdirSync(originalsDir, { recursive: true });

// Long-edge cap for the public preview. Large enough to look sharp on any
// screen (including retina), small enough to be genuinely unsuitable for
// real print reproduction at typical art-print sizes.
const MAX_PREVIEW_DIMENSION = 1600;

async function createPreview(originalPath, previewPath) {
  await sharp(originalPath)
    .resize(MAX_PREVIEW_DIMENSION, MAX_PREVIEW_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .toFile(previewPath);
}

// Takes a freshly-uploaded multer file (already saved into data/uploads),
// generates a public preview alongside it, then moves the true original
// into the private data/originals folder (never served publicly). Returns
// the public preview path (for image_path) and the bare filename to
// remember for later admin-only downloads (for original_path).
async function splitUploadedFile(file) {
  const previewFilename = `preview-${file.filename}`;
  const previewPath = path.join(uploadsDir, previewFilename);

  await createPreview(file.path, previewPath);

  const originalDestPath = path.join(originalsDir, file.filename);
  fs.renameSync(file.path, originalDestPath);

  return {
    imagePath: `/uploads/${previewFilename}`,
    originalFilename: file.filename
  };
}

module.exports = { createPreview, splitUploadedFile, MAX_PREVIEW_DIMENSION, originalsDir };
