const express = require('express');
const { verifyToken } = require('../src/middleware/auth.middleware');
const { requireActivePro, fromPettyAccountBody } = require('../middleware/pro.middleware');
const { topupCrew, getMyAccount, createTransaction, getPromoterOverview } = require('../controllers/pettycash.controller');

const router = express.Router();

// Petty Cash = fitur Pro per-event. overview/my-account via ?eventId=; topup/transaction via accountId→event.
// Semua di-gate berdasarkan status Pro PEMILIK EVENT (mengunci aksi crew kalau Pro promotor untuk event lapse).
// Spesifik routes HARUS di atas wildcard
router.get('/overview', verifyToken, requireActivePro(), getPromoterOverview);
router.get('/my-account', verifyToken, requireActivePro(), getMyAccount);
router.post('/topup', verifyToken, requireActivePro(fromPettyAccountBody), topupCrew);
router.post('/transaction', verifyToken, requireActivePro(fromPettyAccountBody), createTransaction);

module.exports = router;
