const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const imageController = require('../controllers/imageController');

// Preprocess an image (upload single file)
router.post('/preprocess', upload.any(), imageController.preprocessImage);

// Extract ID from front and back images (JSON payload with base64)
router.post('/face-match',upload.any(), imageController.faceMatching);

module.exports = router;