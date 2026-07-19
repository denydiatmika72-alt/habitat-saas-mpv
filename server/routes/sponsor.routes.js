const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const {
  requireActivePro,
  fromBenefitParam,
  fromPackageParam,
  fromDealParam,
  fromDealBody,
  fromDeliverableParam,
} = require('../middleware/pro.middleware');
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
const { getKerjasamaDashboard } = require('../controllers/kerjasama-dashboard.controller');

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
});

// Dashboard Kerjasama — ringkasan per-event (read-only, di-scope promotorId + eventId). Pro per-event (?eventId=).
router.get('/dashboard-summary', verifyToken, requireActivePro(), getKerjasamaDashboard);

// Invite codes
router.post('/codes', verifyToken, requireActivePro(), generateCode);
router.post('/codes/validate', validateInviteCode);         // public

// ─── PUBLIC sponsor-facing (di-scope oleh resource, BUKAN token promotor) ───────
// Katalog portal di-scope oleh KODE undangan; harga tier sponsor-dashboard di-scope oleh dealId.
// Menggantikan pemakaian publik lama GET /benefits, /packages, /thresholds yang kini di-lock.
router.get('/portal/catalog', getPortalCatalog);            // public — portal sponsor (by ?code=)
router.get('/public/tier-price', getPublicTierPrice);       // public — sponsor-dashboard (by ?dealId=)

// Benefits — DIKUNCI ke promotor (sebelumnya publik → bocor lintas akun) + Pro per-event
router.get('/benefits', verifyToken, requireActivePro(), getBenefits);
router.post('/benefits', verifyToken, requireActivePro(), createBenefit);
router.delete('/benefits/:id', verifyToken, requireActivePro(fromBenefitParam), deleteBenefit);

// Deals — GET lintas-event (cek Pro user); mutasi di-scope event deal
router.get('/deals', verifyToken, requireActivePro(), getDeals);
router.post('/deals', createDeal);                          // public — portal sponsor (owner diturunkan dari kode)
router.patch('/deals/:id', verifyToken, requireActivePro(fromDealParam), updateDealStatus);

// Packages — DIKUNCI ke promotor + Pro per-event
router.get('/packages', verifyToken, requireActivePro(), getPackages);
router.post('/packages', verifyToken, requireActivePro(), createPackage);
router.delete('/packages/:id', verifyToken, requireActivePro(fromPackageParam), deletePackage);

// Thresholds — DIKUNCI ke promotor + Pro per-event
router.get('/thresholds', verifyToken, requireActivePro(), getThresholds);
router.post('/thresholds', verifyToken, requireActivePro(), saveThresholds);

// Client accounts — createAccount di-scope event deal (Pro); verify PUBLIK (login sponsor, jangan gate)
router.post('/accounts', verifyToken, requireActivePro(fromDealBody), createAccount);
router.post('/accounts/verify', verifyLimiter, verifyAccount);           // public + rate-limited
router.post('/deals/:id/resend-credential', verifyToken, requireActivePro(fromDealParam), resendCredential);

// Deliverables — GET PUBLIK (client dashboard sponsor); mutasi di-scope event deal (Pro)
router.get('/deliverables', getDeliverables);               // public — client dashboard (by ?dealId=)
router.post('/deliverables', verifyToken, requireActivePro(fromDealBody), createDeliverable);
router.patch('/deliverables/:id', verifyToken, requireActivePro(fromDeliverableParam), updateDeliverable);

module.exports = router;
