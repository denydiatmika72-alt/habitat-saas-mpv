const express = require('express');
const router = express.Router();
const { verifyToken } = require('../src/middleware/auth.middleware');
const { createProPayment, handleWebhook, getPaymentStatus } = require('../controllers/payment.controller');

router.post('/create-pro', verifyToken, createProPayment);
router.post('/webhook', handleWebhook); // NO verifyToken — dipanggil langsung oleh Midtrans
router.get('/status/:orderId', verifyToken, getPaymentStatus);

module.exports = router;
