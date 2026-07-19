const express = require('express')
const router = express.Router()
const { verifyToken } = require('../src/middleware/auth.middleware')
const { requireActivePro } = require('../middleware/pro.middleware')
const { getPLReport, exportPLReportPDF } = require('../controllers/pl-report.controller')

// Laporan P&L (+ export PDF) = fitur Pro per-event (?eventId=).
// MUST register /export-pdf BEFORE / to avoid wildcard clash
router.get('/export-pdf', verifyToken, requireActivePro(), exportPLReportPDF)
router.get('/', verifyToken, requireActivePro(), getPLReport)

module.exports = router
