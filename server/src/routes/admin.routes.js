const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { getPendingUsers, approveUser } = require('../controllers/admin.controller');

router.get('/users', protect, getPendingUsers);
router.patch('/users/:id/approve', protect, approveUser);

module.exports = router;
