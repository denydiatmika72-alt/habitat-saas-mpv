const express = require('express');
const router = express.Router();
const { protect } = require('../src/middleware/auth.middleware');
const { getEventAudienceReport, getAllEventsAudienceReport } = require('../controllers/audience-report.controller');

// Data Audiens (Roadmap #5) — promotor-only, data event MILIK SENDIRI (ownership dicek di controller).
// Bukan admin. Route statis '/all-events' didaftarkan sebelum '/event/:eventId' agar tidak ketubruk.
router.get('/all-events', protect, getAllEventsAudienceReport);
router.get('/event/:eventId', protect, getEventAudienceReport);

module.exports = router;
