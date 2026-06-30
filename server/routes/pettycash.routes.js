const express = require('express');
const { verifyToken } = require('../src/middleware/auth.middleware');
const { topupCrew, getMyAccount, createTransaction, getPromoterOverview } = require('../controllers/pettycash.controller');

const router = express.Router();

// Spesifik routes HARUS di atas wildcard
router.get('/overview', verifyToken, getPromoterOverview);
router.get('/my-account', verifyToken, getMyAccount);
router.post('/topup', verifyToken, topupCrew);
router.post('/transaction', verifyToken, createTransaction);

module.exports = router;
