const express = require('express');
const { protect, requireAdmin } = require('../src/middleware/auth.middleware');
const { requireActivePro } = require('../middleware/pro.middleware');
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

// Promotor-facing → mount di /api/payout. Payout = fitur Pro, TAPI LINTAS-EVENT (saldo agregat, tak ada
// satu eventId) → requireActivePro() memakai fallback user-level: pemanggil harus punya Pro aktif untuk
// event mana pun. Admin routes TIDAK di-gate (admin yang eksekusi transfer). CATATAN BISNIS: ini berarti
// Starter yang menjual tiket (komisi) belum bisa menarik saldo tanpa Pro — sesuai daftar fitur founder.
// Route statis ('/balance', '/my-requests') di atas '/:id/...' agar tidak ketubruk wildcard.
const payoutRoutes = express.Router();
payoutRoutes.get('/balance', protect, requireActivePro(), getAvailableBalance);
payoutRoutes.get('/my-requests', protect, requireActivePro(), getMyPayoutRequests);
payoutRoutes.get('/:id/statement-pdf', protect, requireActivePro(), getPayoutStatementPDF);
payoutRoutes.post('/request', protect, requireActivePro(), requestPayout);

// Admin-facing → mount di /api/admin/payout (mirror pola fee-debt).
// Route spesifik ('/pending') di atas '/:id/...' agar tidak ketubruk wildcard.
const adminPayoutRoutes = express.Router();
adminPayoutRoutes.get('/pending', protect, requireAdmin, getPendingPayoutRequests);
adminPayoutRoutes.patch('/:id/approve', protect, requireAdmin, approvePayoutRequest);
adminPayoutRoutes.patch('/:id/reject', protect, requireAdmin, rejectPayoutRequest);
adminPayoutRoutes.patch('/:id/transferred', protect, requireAdmin, markPayoutTransferred);

module.exports = { payoutRoutes, adminPayoutRoutes };
