const express = require('express');
const router = express.Router();
const { protect, requireAdmin } = require('../middleware/auth.middleware');
const { getPendingUsers, approveUser } = require('../controllers/admin.controller');
const {
  getStorefrontRequests,
  approveStorefront,
  rejectStorefront,
} = require('../../controllers/ticket.controller');
const {
  getMerchApprovalRequests,
  approveMerchItem,
  rejectMerchItem,
} = require('../../controllers/merch.controller');

router.get('/users', protect, requireAdmin, getPendingUsers);
router.patch('/users/:id/approve', protect, requireAdmin, approveUser);

router.get('/storefront-requests', protect, requireAdmin, getStorefrontRequests);
router.patch('/storefront-requests/:eventId/approve', protect, requireAdmin, approveStorefront);
router.patch('/storefront-requests/:eventId/reject', protect, requireAdmin, rejectStorefront);

router.get('/merch-requests', protect, requireAdmin, getMerchApprovalRequests);
router.patch('/merch-requests/:id/approve', protect, requireAdmin, approveMerchItem);
router.patch('/merch-requests/:id/reject', protect, requireAdmin, rejectMerchItem);

module.exports = router;
