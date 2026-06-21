const express = require('express');
const router = express.Router();
const { 
  createEvent, 
  getEvents, 
  getEventById, 
  deleteEvent 
} = require('../controllers/event.controller');

// Auth middleware — destructure karena auth.middleware.js mengexport { verifyToken }
const { verifyToken } = require('../middleware/auth.middleware');

router.post('/', verifyToken, createEvent);
router.get('/', verifyToken, getEvents);

// 2 Route di bawah ini WAJIB berada di bawah route '/' di atas
router.get('/:id', verifyToken, getEventById);
router.delete('/:id', verifyToken, deleteEvent);

module.exports = router;