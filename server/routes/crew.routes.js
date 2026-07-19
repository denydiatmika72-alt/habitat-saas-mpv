const express = require('express');
const { verifyToken } = require('../src/middleware/auth.middleware');
const { requireActivePro, fromCrewParam } = require('../middleware/pro.middleware');
const { inviteCrew, getEventCrew, removeCrew, getMyCrew } = require('../controllers/crew.controller');

const router = express.Router();

// Field Crew = fitur Pro per-event. '/my-events' = navigasi akun CREW (bukan promotor, tak punya Pro sendiri)
// → SENGAJA tidak di-gate; aksi uang crew (petty cash) di-gate per-event di pettycash.routes.
// Spesifik routes HARUS di atas /:crewId agar tidak ketubruk
router.get('/my-events', verifyToken, getMyCrew);
router.get('/', verifyToken, requireActivePro(), getEventCrew);
router.post('/invite', verifyToken, requireActivePro(), inviteCrew);
router.delete('/:crewId', verifyToken, requireActivePro(fromCrewParam), removeCrew);

module.exports = router;
