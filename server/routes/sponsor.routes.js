const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const {
  generateCode,
  validateInviteCode,
  getBenefits,
  createBenefit,
  deleteBenefit,
  getDeals,
  createDeal,
  updateDealStatus,
  getPackages,
  createPackage,
  getThresholds,
  saveThresholds,
  createAccount,
  verifyAccount,
  getDeliverables,
  createDeliverable,
  updateDeliverable,
} = require('../controllers/sponsor.controller');

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
});

// Invite codes
router.post('/codes', verifyToken, generateCode);
router.post('/codes/validate', validateInviteCode);         // public

// Benefits
router.get('/benefits', verifyToken, getBenefits);
router.post('/benefits', verifyToken, createBenefit);
router.delete('/benefits/:id', verifyToken, deleteBenefit);

// Deals
router.get('/deals', verifyToken, getDeals);
router.post('/deals', createDeal);                          // public — sponsor portal
router.patch('/deals/:id', verifyToken, updateDealStatus);

// Packages
router.get('/packages', verifyToken, getPackages);
router.post('/packages', verifyToken, createPackage);

// Thresholds
router.get('/thresholds', getThresholds);                   // public — sponsor portal
router.post('/thresholds', verifyToken, saveThresholds);

// Client accounts
router.post('/accounts', verifyToken, createAccount);
router.post('/accounts/verify', verifyLimiter, verifyAccount); // public + rate-limited

// Deliverables
router.get('/deliverables', getDeliverables);               // public — client dashboard
router.post('/deliverables', verifyToken, createDeliverable);
router.patch('/deliverables/:id', verifyToken, updateDeliverable);

module.exports = router;
