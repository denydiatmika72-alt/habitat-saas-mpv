const express = require('express');
const router = express.Router();
const { verifyToken } = require('../src/middleware/auth.middleware');
const {
  createTicketType,
  updateTicketType,
  deleteTicketType,
  getTicketTypes,
  requestStorefrontApproval,
  updateStorefrontSettings,
  getOrdersByEvent,
  getTicketsByOrder,
} = require('../controllers/ticket.controller');

// Spesifik routes HARUS di atas /types/:id agar tidak ketubruk wildcard
router.get('/types', verifyToken, getTicketTypes);
router.post('/types', verifyToken, createTicketType);
router.patch('/types/:id', verifyToken, updateTicketType);
router.delete('/types/:id', verifyToken, deleteTicketType);

router.post('/request-approval', verifyToken, requestStorefrontApproval);
router.patch('/storefront-settings', verifyToken, updateStorefrontSettings);

router.get('/orders', verifyToken, getOrdersByEvent);
router.get('/by-order/:orderId', verifyToken, getTicketsByOrder);

module.exports = router;
