const express = require('express');
const router = express.Router();
const {
  createEvent,
  getEvents,
  getEventById,
  deleteEvent,
  togglePublish,
} = require('../controllers/event.controller');
const {
  createChangeRequest,
  getMyChangeRequests,
} = require('../controllers/event-change-request.controller');
const { getRabItemsByEvent } = require('../controllers/budget.controller');
const { finishEvent, getEventSummaryPDF } = require('../controllers/event-summary.controller');

// Auth middleware — destructure karena auth.middleware.js mengexport { verifyToken }
const { verifyToken } = require('../middleware/auth.middleware');
const { requireActivePro, fromParam } = require('../middleware/pro.middleware');

// createEvent/getEvents/getEventById/publish/delete = GRATIS (buat event tanpa batas) — JANGAN gate.
router.post('/', verifyToken, createEvent);
router.get('/', verifyToken, getEvents);

// Specific routes WAJIB di atas /:id agar tidak tertimpa wildcard
// rab-items = RAB/Budget (Starter gratis) → TIDAK di-gate.
router.get('/:eventId/rab-items', verifyToken, getRabItemsByEvent);

// Event Summary Report (Laporan Akhir Event) = fitur Pro per-event → di-gate.
router.post('/:eventId/finish', verifyToken, requireActivePro(fromParam('eventId')), finishEvent);
router.get('/:eventId/summary-pdf', verifyToken, requireActivePro(fromParam('eventId')), getEventSummaryPDF);

// Permintaan Perubahan Event (2026-07-21) — satu-satunya jalur promotor untuk mengubah
// 5 field terkunci + menghapus event. TIDAK di-gate Pro: mengubah nama/lokasi/kapasitas/target
// dan mengajukan hapus adalah administrasi dasar event, bukan fitur Pro (pola sama createEvent).
router.post('/:id/change-requests', verifyToken, createChangeRequest);
router.get('/:id/change-requests', verifyToken, getMyChangeRequests);

router.get('/:id', verifyToken, getEventById);
router.patch('/:id/publish', verifyToken, togglePublish);
// ⛔ DELETE ini sekarang SELALU 403 — hapus event hanya lewat persetujuan admin.
// Route sengaja DIPERTAHANKAN (bukan dihapus) supaya klien lama dapat pesan jelas, bukan 404 misterius.
// Catatan untuk perubahan berikutnya: kalau suatu saat menambah PATCH /api/events/:id yang umum,
// WAJIB tolak kolom di LOCKED_EVENT_COLUMNS (services/event-change-request.service.js).
router.delete('/:id', verifyToken, deleteEvent);

module.exports = router;