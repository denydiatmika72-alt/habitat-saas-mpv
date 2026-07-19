const express = require('express');
const { verifyToken } = require('../src/middleware/auth.middleware');
const { requireActivePro } = require('../middleware/pro.middleware');
const { inviteScanner, getMyScannerEvents, getEventScanners, removeScanner, validateTicket } = require('../controllers/scanner.controller');

const router = express.Router();

// Gate Scanner = fitur Pro per-event (gate by status Pro PEMILIK event). '/my-events' = navigasi akun SCANNER
// (bukan promotor, tak punya Pro sendiri) → SENGAJA tidak di-gate. validateTicket (aksi scanner) di-gate
// per-event via body.eventId → tervalidasi hanya jika Pro promotor untuk event itu aktif.
// Spesifik routes didaftarkan sebelum yang lebih generik (jaga pola konsisten).
router.get('/my-events', verifyToken, getMyScannerEvents);              // scanner
router.get('/event/:eventId', verifyToken, requireActivePro(), getEventScanners);           // promotor — daftar scanner event
router.delete('/event/:eventId/:scannerId', verifyToken, requireActivePro(), removeScanner); // promotor — hapus scanner dari event
router.post('/invite', verifyToken, requireActivePro(), inviteScanner);                     // promotor
router.post('/validate', verifyToken, requireActivePro(), validateTicket);                  // scanner

module.exports = router;
