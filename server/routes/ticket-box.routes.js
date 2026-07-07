const express = require('express');
const router = express.Router();
const { getTicketBoxEvent, createTicketBoxOrder } = require('../controllers/ticket-box.controller');

// Semua route di sini PUBLIC — tanpa verifyToken (panitia scan QR, pembeli isi sendiri).
router.get('/:eventId', getTicketBoxEvent);
router.post('/:eventId/order', createTicketBoxOrder);

module.exports = router;
