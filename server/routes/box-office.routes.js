const express = require('express');
const router = express.Router();
const { getBoxOfficeEvent, createBoxOfficeOrder } = require('../controllers/box-office.controller');

// Semua route di sini PUBLIC — tanpa verifyToken (panitia scan QR, pembeli isi sendiri).
router.get('/:eventId', getBoxOfficeEvent);
router.post('/:eventId/order', createBoxOfficeOrder);

module.exports = router;
