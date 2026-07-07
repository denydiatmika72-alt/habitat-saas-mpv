const express = require('express');
const router = express.Router();
const { protect, requireAdmin } = require('../src/middleware/auth.middleware');
const { getFeeDebtByPromoter, getFeeDebtDetail, settleFeeDebt } = require('../controllers/fee-debt.controller');

// Semua route admin-only (rekonsiliasi hutang fee Ticket Box — Roadmap #4).
// Route spesifik ('/by-promoter') di atas '/:promotorId/...' agar tidak ketubruk wildcard.
router.get('/by-promoter', protect, requireAdmin, getFeeDebtByPromoter);
router.get('/:promotorId/detail', protect, requireAdmin, getFeeDebtDetail);
router.patch('/:promotorId/settle', protect, requireAdmin, settleFeeDebt);

module.exports = router;
