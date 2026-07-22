const express = require('express');
const { verifyToken } = require('../src/middleware/auth.middleware');
const { requireActivePro } = require('../middleware/pro.middleware');
const { getSimulation, saveSimulation } = require('../controllers/ticket-simulation.controller');

const router = express.Router();

// Simulasi Harga Tiket = fitur Pro per-event (lihat CLAUDE.md "Pricing & Subscription Model").
// eventId di query (GET) & body (POST) → resolver default requireActivePro() menemukannya.
// Ringkasan di Dashboard Perencanaan memakai GET ini; kalau Pro event lapse, GET 402 dan kartu
// jatuh ke empty state — konsisten dengan penguncian fitur Pro lain.
router.get('/', verifyToken, requireActivePro(), getSimulation);
router.post('/', verifyToken, requireActivePro(), saveSimulation);

module.exports = router;
