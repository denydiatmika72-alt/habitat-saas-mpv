const express = require('express');
const router = express.Router();
const {
  getBudgetByEvent,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/budget.controller');

// Auth middleware — destructure karena auth.middleware.js mengexport { verifyToken }
const { verifyToken } = require('../middleware/auth.middleware');

// Rute umum budget & kategori
router.post('/categories', verifyToken, createCategory);

// ===================================================================
// POSISI SANGAT PENTING: PUT harus di atas DELETE dan rute ID umum
// ===================================================================
router.put('/categories/:categoryId', verifyToken, updateCategory);    // Menghilangkan 404 saat rename kategori
router.delete('/categories/:categoryId', verifyToken, deleteCategory);

// Ambil data budget berdasarkan Event ID (Paling bawah agar tidak bentrok pattern)
router.get('/:eventId', verifyToken, getBudgetByEvent);

module.exports = router;