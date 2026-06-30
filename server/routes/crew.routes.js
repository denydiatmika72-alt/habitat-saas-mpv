const express = require('express');
const { verifyToken } = require('../src/middleware/auth.middleware');
const { inviteCrew, getEventCrew, removeCrew, getMyCrew } = require('../controllers/crew.controller');

const router = express.Router();

// Spesifik routes HARUS di atas /:crewId agar tidak ketubruk
router.get('/my-events', verifyToken, getMyCrew);
router.get('/', verifyToken, getEventCrew);
router.post('/invite', verifyToken, inviteCrew);
router.delete('/:crewId', verifyToken, removeCrew);

module.exports = router;
