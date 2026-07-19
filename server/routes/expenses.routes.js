const express = require('express');
const { verifyToken } = require('../src/middleware/auth.middleware');
const { requireActivePro, fromExpenseParam } = require('../middleware/pro.middleware');
const { getExpenses, createExpense, deleteExpense, getBudgetCategories } = require('../controllers/expenses.controller');

const router = express.Router();

// Expense Tracker = fitur Pro per-event (TERPISAH dari RAB/Budget yang tetap gratis/Starter).
// getBudgetCategories hanya melayani form Expense Tracker (dropdown kategori) → ikut di-gate.
// Spesifik routes HARUS di atas /:id agar tidak ketubruk
router.get('/budget-categories', verifyToken, requireActivePro(), getBudgetCategories);
router.get('/', verifyToken, requireActivePro(), getExpenses);
router.post('/', verifyToken, requireActivePro(), createExpense);
router.delete('/:id', verifyToken, requireActivePro(fromExpenseParam), deleteExpense);

module.exports = router;
