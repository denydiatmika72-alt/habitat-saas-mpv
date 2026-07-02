const express = require('express');
const router = express.Router();
const { verifyToken } = require('../src/middleware/auth.middleware');
const { uploadEventBanner, uploadEventLogo } = require('../controllers/upload.controller');

router.post('/event-banner', verifyToken, ...uploadEventBanner);
router.post('/event-logo', verifyToken, ...uploadEventLogo);

module.exports = router;
