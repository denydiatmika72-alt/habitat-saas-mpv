const express = require('express');
const router = express.Router();
const { protect, requireAdmin } = require('../middleware/auth.middleware');
const { getPendingUsers, approveUser } = require('../controllers/admin.controller');
const {
  getStorefrontRequests,
  approveStorefront,
  rejectStorefront,
  getEventsWithFees,
  updateEventFees,
} = require('../../controllers/ticket.controller');
const {
  getMerchApprovalRequests,
  approveMerchItem,
  rejectMerchItem,
} = require('../../controllers/merch.controller');
const {
  getBundleApprovalRequests,
  approveBundle,
  rejectBundle,
} = require('../../controllers/bundle.controller');

router.get('/users', protect, requireAdmin, getPendingUsers);
router.patch('/users/:id/approve', protect, requireAdmin, approveUser);

// Kelola fee event kapanpun (independen dari flow approval).
// '/events-fees' harus di atas '/events/:eventId/fees' — beda path, tidak ketubruk, tapi jaga urutan.
router.get('/events-fees', protect, requireAdmin, getEventsWithFees);
router.patch('/events/:eventId/fees', protect, requireAdmin, updateEventFees);

router.get('/storefront-requests', protect, requireAdmin, getStorefrontRequests);
router.patch('/storefront-requests/:eventId/approve', protect, requireAdmin, approveStorefront);
router.patch('/storefront-requests/:eventId/reject', protect, requireAdmin, rejectStorefront);

router.get('/merch-requests', protect, requireAdmin, getMerchApprovalRequests);
router.patch('/merch-requests/:id/approve', protect, requireAdmin, approveMerchItem);
router.patch('/merch-requests/:id/reject', protect, requireAdmin, rejectMerchItem);

router.get('/bundle-requests', protect, requireAdmin, getBundleApprovalRequests);
router.patch('/bundle-requests/:id/approve', protect, requireAdmin, approveBundle);
router.patch('/bundle-requests/:id/reject', protect, requireAdmin, rejectBundle);

module.exports = router;
