const sharp = require('sharp');

async function optimizeImage(buffer) {
  return await sharp(buffer)
    .resize(1568, 1568, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

module.exports = { optimizeImage };