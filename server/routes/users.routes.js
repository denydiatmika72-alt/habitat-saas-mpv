const express = require('express');
const { verifyToken } = require('../src/middleware/auth.middleware');
const { updatePlan } = require('../controllers/users.controller');

const router = express.Router();

router.patch('/plan', verifyToken, updatePlan);

module.exports = router;
