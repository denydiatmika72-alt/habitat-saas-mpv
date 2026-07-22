const express = require('express');
const router = express.Router();
const { verifyToken } = require('../src/middleware/auth.middleware');
const { getDashboardSummary } = require('../controllers/dashboard.controller');

// Ringkasan kartu Akses Cepat Dashboard KPI. SENGAJA TANPA requireActivePro:
// sebagian metrik (RAB, tiket terjual, saldo payout) Starter-accessible; seksi Pro
// (sponsor, keuangan) ditandai { proLocked: true } per-seksi di controller.
router.get('/summary', verifyToken, getDashboardSummary);

module.exports = router;
