const express = require('express');
const router = express.Router();
const {
  getBudgetByEvent,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/budget.controller');

// Pastikan nama file middleware ini sesuai dengan sistem login Anda
const verifyToken = require('../middleware/verifyToken'); 

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