const express = require('express');
const router = express.Router();
const { 
  createEvent, 
  getEvents, 
  getEventById, 
  deleteEvent 
} = require('../controllers/event.controller');

// Pastikan nama file middleware ini sesuai dengan file autentikasi yang kamu punya
// Jika nama file middleware kamu beda (misal: auth.js), tolong ubah './verifyToken' di bawah
const verifyToken = require('../middleware/verifyToken'); 

router.post('/', verifyToken, createEvent);
router.get('/', verifyToken, getEvents);

// 2 Route di bawah ini WAJIB berada di bawah route '/' di atas
router.get('/:id', verifyToken, getEventById);
router.delete('/:id', verifyToken, deleteEvent);

module.exports = router;