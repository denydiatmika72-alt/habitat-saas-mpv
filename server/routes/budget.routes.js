const express = require('express');
const router = express.Router();
const {
  initializeBudget,
  getBudget,
  addCategory,
  deleteCategory,
  addBudgetItem,
  deleteBudgetItem,
} = require('../controllers/budget.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// POST /api/budgets/initialize — Inisialisasi RAB + kategori default
router.post('/initialize', verifyToken, initializeBudget);

// POST /api/budgets/:budgetId/categories — Tambah kategori baru
router.post('/:budgetId/categories', verifyToken, addCategory);

// POST /api/budgets/categories/:categoryId/items — Tambah item + auto-kalkulasi
router.post('/categories/:categoryId/items', verifyToken, addBudgetItem);

// DELETE /api/budgets/categories/:categoryId — Hapus kategori + semua item-nya + auto-kalkulasi
router.delete('/categories/:categoryId', verifyToken, deleteCategory);

// DELETE /api/budgets/items/:itemId — Hapus item + auto-kalkulasi ulang
router.delete('/items/:itemId', verifyToken, deleteBudgetItem);

// GET /api/budgets/:eventId — Ambil detail RAB + kategori + item
router.get('/:eventId', verifyToken, getBudget);

module.exports = router;
