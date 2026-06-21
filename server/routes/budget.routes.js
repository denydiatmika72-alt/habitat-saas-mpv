const express = require('express');
const router = express.Router();
const {
  initializeBudget,
  getBudgetByEvent,
  createCategory,
  updateCategory,
  deleteCategory,
  createItem,
  deleteItem,
} = require('../controllers/budget.controller');

// Auth middleware — destructure karena auth.middleware.js mengexport { verifyToken }
const { verifyToken } = require('../middleware/auth.middleware');

// ─────────────────────────────────────────────────────────────────────────────
// URUTAN ROUTE SANGAT PENTING:
// Route spesifik WAJIB di atas wildcard /:eventId agar tidak ketubruk.
// ─────────────────────────────────────────────────────────────────────────────

// Inisialisasi Budget untuk sebuah Event (buat jika belum ada)
router.post('/initialize', verifyToken, initializeBudget);

// Operasi Kategori
router.post('/categories',              verifyToken, createCategory);
router.put('/categories/:categoryId',   verifyToken, updateCategory);
router.delete('/categories/:categoryId', verifyToken, deleteCategory);

// Operasi Item — POST harus di atas DELETE /items agar tidak bentrok
router.post('/categories/:categoryId/items', verifyToken, createItem);
router.delete('/items/:itemId',              verifyToken, deleteItem);

// Ambil data budget berdasarkan Event ID — HARUS paling bawah (wildcard pattern)
router.get('/:eventId', verifyToken, getBudgetByEvent);

module.exports = router;
