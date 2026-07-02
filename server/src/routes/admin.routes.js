const express = require('express');
const router = express.Router();
const { protect, requireAdmin } = require('../middleware/auth.middleware');
const { getPendingUsers, approveUser } = require('../controllers/admin.controller');

router.get('/users', protect, requireAdmin, getPendingUsers);
router.patch('/users/:id/approve', protect, requireAdmin, approveUser);

module.exports = router;
