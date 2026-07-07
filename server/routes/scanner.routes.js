const express = require('express');
const { verifyToken } = require('../src/middleware/auth.middleware');
const { inviteScanner, getMyScannerEvents, getEventScanners, removeScanner, validateTicket } = require('../controllers/scanner.controller');

const router = express.Router();

// Spesifik routes didaftarkan sebelum yang lebih generik (jaga pola konsisten).
router.get('/my-events', verifyToken, getMyScannerEvents);              // scanner
router.get('/event/:eventId', verifyToken, getEventScanners);           // promotor — daftar scanner event
router.delete('/event/:eventId/:scannerId', verifyToken, removeScanner); // promotor — hapus scanner dari event
router.post('/invite', verifyToken, inviteScanner);                     // promotor
router.post('/validate', verifyToken, validateTicket);                  // scanner

module.exports = router;
