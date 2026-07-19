const express = require('express');
const router = express.Router();
const {
  createEvent,
  getEvents,
  getEventById,
  deleteEvent,
  togglePublish,
} = require('../controllers/event.controller');
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

router.get('/:id', verifyToken, getEventById);
router.patch('/:id/publish', verifyToken, togglePublish);
router.delete('/:id', verifyToken, deleteEvent);

module.exports = router;