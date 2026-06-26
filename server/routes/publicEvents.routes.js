const express = require('express');
const router = express.Router();
const { getPublishedEvents, searchPublishedEvents } = require('../controllers/publicEvents.controller');

// Public endpoints — tanpa auth middleware
router.get('/', getPublishedEvents);
router.get('/search', searchPublishedEvents);

module.exports = router;
