const express = require('express');
const router = express.Router();
const { createEvent, getEvents } = require('../controllers/event.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// POST /api/events — Buat event baru (wajib login)
router.post('/', verifyToken, createEvent);

// GET /api/events — Ambil semua event milik promotor yang login
router.get('/', verifyToken, getEvents);

module.exports = router;
