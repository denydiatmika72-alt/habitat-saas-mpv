const express = require('express');
const router = express.Router();
const { createEvent } = require('../controllers/event.controller');
const auth = require('../middleware/auth');

router.post('/', auth, createEvent);

module.exports = router;
