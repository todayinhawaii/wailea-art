const sizeOf = require('image-size');

// Reads an image file's actual pixel dimensions and classifies it so the
// gallery card can be shaped to match (wide box for landscape art, tall
// box for portrait, square for square) instead of one fixed shape for all.
function detectOrientation(filePath) {
  try {
    const dimensions = sizeOf(filePath);
    if (!dimensions || !dimensions.width || !dimensions.height) return 'portrait';

    const ratio = dimensions.width / dimensions.height;
    if (ratio > 1.15) return 'landscape';
    if (ratio < 0.87) return 'portrait';
    return 'square';
  } catch (err) {
    console.error('Could not read image dimensions, defaulting to portrait:', err.message);
    return 'portrait';
  }
}

module.exports = detectOrientation;
