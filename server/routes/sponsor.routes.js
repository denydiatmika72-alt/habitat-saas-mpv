const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const {
  generateCode,
  validateInviteCode,
  getPortalCatalog,
  getPublicTierPrice,
  getBenefits,
  createBenefit,
  deleteBenefit,
  getDeals,
  createDeal,
  updateDealStatus,
  getPackages,
  createPackage,
  deletePackage,
  getThresholds,
  saveThresholds,
  createAccount,
  verifyAccount,
  resendCredential,
  getDeliverables,
  createDeliverable,
  updateDeliverable,
} = require('../controllers/sponsor.controller');

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
});

// Invite codes
router.post('/codes', verifyToken, generateCode);
router.post('/codes/validate', validateInviteCode);         // public

// ─── PUBLIC sponsor-facing (di-scope oleh resource, BUKAN token promotor) ───────
// Katalog portal di-scope oleh KODE undangan; harga tier sponsor-dashboard di-scope oleh dealId.
// Menggantikan pemakaian publik lama GET /benefits, /packages, /thresholds yang kini di-lock.
router.get('/portal/catalog', getPortalCatalog);            // public — portal sponsor (by ?code=)
router.get('/public/tier-price', getPublicTierPrice);       // public — sponsor-dashboard (by ?dealId=)

// Benefits — DIKUNCI ke promotor (sebelumnya publik → bocor lintas akun)
router.get('/benefits', verifyToken, getBenefits);
router.post('/benefits', verifyToken, createBenefit);
router.delete('/benefits/:id', verifyToken, deleteBenefit);

// Deals
router.get('/deals', verifyToken, getDeals);
router.post('/deals', createDeal);                          // public — portal sponsor (owner diturunkan dari kode)
router.patch('/deals/:id', verifyToken, updateDealStatus);

// Packages — DIKUNCI ke promotor
router.get('/packages', verifyToken, getPackages);
router.post('/packages', verifyToken, createPackage);
router.delete('/packages/:id', verifyToken, deletePackage);

// Thresholds — DIKUNCI ke promotor
router.get('/thresholds', verifyToken, getThresholds);
router.post('/thresholds', verifyToken, saveThresholds);

// Client accounts
router.post('/accounts', verifyToken, createAccount);
router.post('/accounts/verify', verifyLimiter, verifyAccount);           // public + rate-limited
router.post('/deals/:id/resend-credential', verifyToken, resendCredential);

// Deliverables
router.get('/deliverables', getDeliverables);               // public — client dashboard (by ?dealId=)
router.post('/deliverables', verifyToken, createDeliverable);
router.patch('/deliverables/:id', verifyToken, updateDeliverable);

module.exports = router;
