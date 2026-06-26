const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const adminMiddleware = require('../middleware/admin.middleware');
const { getAdminStats, getPendingUsers, getAllUsers, approveUser, suspendUser } = require('../controllers/admin.controller');

router.use(verifyToken, adminMiddleware);

router.get('/stats',         getAdminStats);
router.get('/users/pending', getPendingUsers);
router.get('/users',         getAllUsers);
router.patch('/users/:id/approve', approveUser);
router.patch('/users/:id/suspend', suspendUser);

module.exports = router;
