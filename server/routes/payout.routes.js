const express = require('express');
const { protect, requireAdmin } = require('../src/middleware/auth.middleware');
const {
  getAvailableBalance,
  requestPayout,
  getMyPayoutRequests,
  getPendingPayoutRequests,
  approvePayoutRequest,
  rejectPayoutRequest,
  markPayoutTransferred,
} = require('../controllers/payout.controller');

// Promotor-facing → mount di /api/payout
const payoutRoutes = express.Router();
payoutRoutes.get('/balance', protect, getAvailableBalance);
payoutRoutes.get('/my-requests', protect, getMyPayoutRequests);
payoutRoutes.post('/request', protect, requestPayout);

// Admin-facing → mount di /api/admin/payout (mirror pola fee-debt).
// Route spesifik ('/pending') di atas '/:id/...' agar tidak ketubruk wildcard.
const adminPayoutRoutes = express.Router();
adminPayoutRoutes.get('/pending', protect, requireAdmin, getPendingPayoutRequests);
adminPayoutRoutes.patch('/:id/approve', protect, requireAdmin, approvePayoutRequest);
adminPayoutRoutes.patch('/:id/reject', protect, requireAdmin, rejectPayoutRequest);
adminPayoutRoutes.patch('/:id/transferred', protect, requireAdmin, markPayoutTransferred);

module.exports = { payoutRoutes, adminPayoutRoutes };
