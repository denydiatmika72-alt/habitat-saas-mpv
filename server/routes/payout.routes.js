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
  getPayoutStatementPDF,
} = require('../controllers/payout.controller');

// Promotor-facing → mount di /api/payout. Payout = fitur STARTER (TIDAK di-gate Pro): mencairkan hasil
// penjualan tiket yang monetisasinya lewat komisi transaksi (1.5–3.5%), konsisten dengan Ticketing/Storefront
// — bukan fitur langganan Pro. Hanya `protect` (auth). Admin routes juga tidak di-gate Pro (admin eksekusi transfer).
// Route statis ('/balance', '/my-requests') di atas '/:id/...' agar tidak ketubruk wildcard.
const payoutRoutes = express.Router();
payoutRoutes.get('/balance', protect, getAvailableBalance);
payoutRoutes.get('/my-requests', protect, getMyPayoutRequests);
payoutRoutes.get('/:id/statement-pdf', protect, getPayoutStatementPDF);
payoutRoutes.post('/request', protect, requestPayout);

// Admin-facing → mount di /api/admin/payout (mirror pola fee-debt).
// Route spesifik ('/pending') di atas '/:id/...' agar tidak ketubruk wildcard.
const adminPayoutRoutes = express.Router();
adminPayoutRoutes.get('/pending', protect, requireAdmin, getPendingPayoutRequests);
adminPayoutRoutes.patch('/:id/approve', protect, requireAdmin, approvePayoutRequest);
adminPayoutRoutes.patch('/:id/reject', protect, requireAdmin, rejectPayoutRequest);
adminPayoutRoutes.patch('/:id/transferred', protect, requireAdmin, markPayoutTransferred);

module.exports = { payoutRoutes, adminPayoutRoutes };
