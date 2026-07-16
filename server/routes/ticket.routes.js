const express = require('express');
const router = express.Router();
const { verifyToken } = require('../src/middleware/auth.middleware');
const {
  createTicketType,
  updateTicketType,
  deleteTicketType,
  transferTicketStock,
  getTicketTypes,
  requestStorefrontApproval,
  updateStorefrontSettings,
  updateEventStorefrontInfo,
  getOrdersByEvent,
  getTicketsByOrder,
} = require('../controllers/ticket.controller');
const { generateTicketBoxQR } = require('../controllers/ticket-box.controller');
const { getDashboardSummary, getSalesTrend } = require('../controllers/ticket-dashboard.controller');

// Ticket Box: promotor generate QR untuk penjualan offline di lokasi.
router.post('/ticket-box/generate-qr', verifyToken, generateTicketBoxQR);

// Dashboard Tiket & Pencairan (hub /dashboard/ticketing) — read-only.
router.get('/dashboard-summary', verifyToken, getDashboardSummary);
router.get('/sales-trend', verifyToken, getSalesTrend);

// Spesifik routes HARUS di atas /types/:id agar tidak ketubruk wildcard
router.get('/types', verifyToken, getTicketTypes);
router.post('/types', verifyToken, createTicketType);
router.patch('/types/:id', verifyToken, updateTicketType);
router.delete('/types/:id', verifyToken, deleteTicketType);
router.post('/types/:id/transfer-stock', verifyToken, transferTicketStock);

router.post('/request-approval', verifyToken, requestStorefrontApproval);
router.patch('/storefront-settings', verifyToken, updateStorefrontSettings);
router.patch('/event-info', verifyToken, updateEventStorefrontInfo);

router.get('/orders', verifyToken, getOrdersByEvent);
router.get('/by-order/:orderId', verifyToken, getTicketsByOrder);

module.exports = router;
