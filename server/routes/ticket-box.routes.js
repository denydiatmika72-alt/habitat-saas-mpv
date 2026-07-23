const express = require('express');
const router = express.Router();
const { getTicketBoxEvent, createTicketBoxOrder } = require('../controllers/ticket-box.controller');

// Route di sini tanpa verifyToken (pembeli walk-up anonim scan QR & isi sendiri), TAPI sejak
// 2026-07-24 BUKAN publik polos: keduanya mensyaratkan `Event.boxOfficeToken` (rahasia per-event
// yang ter-embed di URL dalam QR) — 403 tanpa token cocok, fail-closed kalau QR belum digenerate.
// Guard-nya di controller (isValidBoxToken), bukan middleware, karena butuh record event-nya.
router.get('/:eventId', getTicketBoxEvent);
router.post('/:eventId/order', createTicketBoxOrder);

module.exports = router;
