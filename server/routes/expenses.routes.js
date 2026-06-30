const express = require('express');
const { verifyToken } = require('../src/middleware/auth.middleware');
const { getExpenses, createExpense, deleteExpense, getBudgetCategories } = require('../controllers/expenses.controller');

const router = express.Router();

// Spesifik routes HARUS di atas /:id agar tidak ketubruk
router.get('/budget-categories', verifyToken, getBudgetCategories);
router.get('/', verifyToken, getExpenses);
router.post('/', verifyToken, createExpense);
router.delete('/:id', verifyToken, deleteExpense);

module.exports = router;
