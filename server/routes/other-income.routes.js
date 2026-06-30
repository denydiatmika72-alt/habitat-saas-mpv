const express = require('express')
const router = express.Router()
const { verifyToken } = require('../src/middleware/auth.middleware')
const { getOtherIncomes, createOtherIncome, deleteOtherIncome } = require('../controllers/other-income.controller')

router.get('/', verifyToken, getOtherIncomes)
router.post('/', verifyToken, createOtherIncome)
router.delete('/:id', verifyToken, deleteOtherIncome)

module.exports = router
