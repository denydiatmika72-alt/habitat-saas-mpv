const express = require('express');
const { verifyToken } = require('../src/middleware/auth.middleware');
const { getExpenses, createExpense, deleteExpense } = require('../controllers/expenses.controller');

const router = express.Router();

router.get('/', verifyToken, getExpenses);
router.post('/', verifyToken, createExpense);
router.delete('/:id', verifyToken, deleteExpense);

module.exports = router;
