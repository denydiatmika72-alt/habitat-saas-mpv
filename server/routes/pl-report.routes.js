const express = require('express')
const router = express.Router()
const { verifyToken } = require('../src/middleware/auth.middleware')
const { getPLReport, exportPLReportPDF } = require('../controllers/pl-report.controller')

// MUST register /export-pdf BEFORE / to avoid wildcard clash
router.get('/export-pdf', verifyToken, exportPLReportPDF)
router.get('/', verifyToken, getPLReport)

module.exports = router
