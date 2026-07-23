const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const {
  requireActivePro,
  fromBenefitParam,
  fromPackageParam,
  fromThresholdParam,
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
  updateThreshold,
  deleteThreshold,
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

// Rate-limit endpoint publik portal (fix K1 2026-07-25 — dulu tanpa rem sama sekali).
// Dua tingkat sesuai pola pemakaian sah:
//  - WRITE/gate (validate kode + createDeal): sponsor sah paling banter mencoba beberapa kali
//    → 20/15mnt (selaras verifyLimiter). Ini rem utama anti brute-force kode & spam deal.
//  - READ (katalog): halaman form bisa memuat ulang berkali-kali (refresh, re-render)
//    → 60/15mnt, lebih longgar supaya sponsor sah tidak pernah tersandung.
const portalWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' },
});
const portalReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Terlalu banyak permintaan. Coba lagi dalam 15 menit.' },
});

// Dashboard Kerjasama — ringkasan per-event (read-only, di-scope promotorId + eventId). Pro per-event (?eventId=).
router.get('/dashboard-summary', verifyToken, requireActivePro(), getKerjasamaDashboard);

// Invite codes
router.post('/codes', verifyToken, requireActivePro(), generateCode);
router.post('/codes/validate', portalWriteLimiter, validateInviteCode);  // public + rate-limited

// ─── PUBLIC sponsor-facing (di-scope oleh resource, BUKAN token promotor) ───────
// Katalog portal di-scope oleh KODE undangan; harga tier sponsor-dashboard di-scope oleh dealId.
// Menggantikan pemakaian publik lama GET /benefits, /packages, /thresholds yang kini di-lock.
router.get('/portal/catalog', portalReadLimiter, getPortalCatalog);  // public + rate-limited — portal sponsor (by ?code=)
router.get('/public/tier-price', getPublicTierPrice);       // public — sponsor-dashboard (by ?dealId=)

// Benefits — DIKUNCI ke promotor (sebelumnya publik → bocor lintas akun) + Pro per-event
router.get('/benefits', verifyToken, requireActivePro(), getBenefits);
router.post('/benefits', verifyToken, requireActivePro(), createBenefit);
router.delete('/benefits/:id', verifyToken, requireActivePro(fromBenefitParam), deleteBenefit);

// Deals — GET lintas-event (cek Pro user); mutasi di-scope event deal
// ?eventId= WAJIB (2026-07-21) — daftar deal selalu per-event. Karena eventId kini selalu ada,
// requireActivePro() default resolver membacanya dari query → gating Pro jadi PER-EVENT
// (sebelumnya jatuh ke fallback user-level lintas-event).
router.get('/deals', verifyToken, requireActivePro(), getDeals);
router.post('/deals', portalWriteLimiter, createDeal);      // public + rate-limited — portal sponsor (owner dari kode; kode dikonsumsi di sini)
router.patch('/deals/:id', verifyToken, requireActivePro(fromDealParam), updateDealStatus);

// Packages — DIKUNCI ke promotor + Pro per-event
router.get('/packages', verifyToken, requireActivePro(), getPackages);
router.post('/packages', verifyToken, requireActivePro(), createPackage);
router.delete('/packages/:id', verifyToken, requireActivePro(fromPackageParam), deletePackage);

// Thresholds — DIKUNCI ke promotor + Pro per-event
router.get('/thresholds', verifyToken, requireActivePro(), getThresholds);
router.post('/thresholds', verifyToken, requireActivePro(), saveThresholds);         // create tier baru (batch upsert)
router.patch('/thresholds/:id', verifyToken, requireActivePro(fromThresholdParam), updateThreshold);   // rename/reprice by id (cascade)
router.delete('/thresholds/:id', verifyToken, requireActivePro(fromThresholdParam), deleteThreshold);  // hapus by id (blokir kalau dipakai paket)

// Client accounts — createAccount di-scope event deal (Pro); verify PUBLIK (login sponsor, jangan gate)
router.post('/accounts', verifyToken, requireActivePro(fromDealBody), createAccount);
router.post('/accounts/verify', verifyLimiter, verifyAccount);           // public + rate-limited
router.post('/deals/:id/resend-credential', verifyToken, requireActivePro(fromDealParam), resendCredential);

// Deliverables — GET PUBLIK (client dashboard sponsor); mutasi di-scope event deal (Pro)
router.get('/deliverables', getDeliverables);               // public — client dashboard (by ?dealId=)
router.post('/deliverables', verifyToken, requireActivePro(fromDealBody), createDeliverable);
router.patch('/deliverables/:id', verifyToken, requireActivePro(fromDeliverableParam), updateDeliverable);

module.exports = router;
