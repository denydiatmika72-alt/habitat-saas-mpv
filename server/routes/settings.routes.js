const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { getPromoterSettings, savePromoterSettings } = require('../controllers/settings.controller');

router.get('/promoter', verifyToken, getPromoterSettings);
router.post('/promoter', verifyToken, savePromoterSettings);

module.exports = router;
