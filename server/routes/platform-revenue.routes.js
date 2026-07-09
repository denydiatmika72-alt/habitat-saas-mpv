const express = require('express');
const router = express.Router();
const { protect, requireAdmin } = require('../src/middleware/auth.middleware');
const { getPlatformRevenue } = require('../controllers/platform-revenue.controller');

// Laporan Pendapatan Platform (Roadmap #4) — admin only. Mount di /api/admin/platform-revenue.
router.get('/revenue', protect, requireAdmin, getPlatformRevenue);

module.exports = router;
