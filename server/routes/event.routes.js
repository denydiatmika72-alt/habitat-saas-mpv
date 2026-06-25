const express = require('express');
const router = express.Router();
const {
  createEvent,
  getEvents,
  getEventById,
  deleteEvent
} = require('../controllers/event.controller');
const { getRabItemsByEvent } = require('../controllers/budget.controller');

// Auth middleware — destructure karena auth.middleware.js mengexport { verifyToken }
const { verifyToken } = require('../middleware/auth.middleware');

router.post('/', verifyToken, createEvent);
router.get('/', verifyToken, getEvents);

// Specific routes WAJIB di atas /:id agar tidak tertimpa wildcard
router.get('/:eventId/rab-items', verifyToken, getRabItemsByEvent);

router.get('/:id', verifyToken, getEventById);
router.delete('/:id', verifyToken, deleteEvent);

module.exports = router;