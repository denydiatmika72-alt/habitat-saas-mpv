const express = require('express');
const router = express.Router();
const { protect } = require('../src/middleware/auth.middleware');
const { requireActivePro, fromParam } = require('../middleware/pro.middleware');
const { getEventAudienceReport, getAllEventsAudienceReport } = require('../controllers/audience-report.controller');

// Data Audiens (Roadmap #5) — fitur Pro. '/event/:eventId' di-gate per-event; '/all-events' lintas-event
// (agregat semua event promotor) → gate user-level (punya Pro aktif untuk event mana pun).
// Route statis '/all-events' didaftarkan sebelum '/event/:eventId' agar tidak ketubruk.
router.get('/all-events', protect, requireActivePro(), getAllEventsAudienceReport);
router.get('/event/:eventId', protect, requireActivePro(fromParam('eventId')), getEventAudienceReport);

module.exports = router;
