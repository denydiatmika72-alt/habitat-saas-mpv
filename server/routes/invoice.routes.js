const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { requireActivePro, fromInvoiceParam, fromInvoiceGenerate } = require('../middleware/pro.middleware');
const {
  getInvoices,
  getInvoice,
  getInvoiceByDeal,
  generateInvoice,
  updateInvoiceStatus,
  deleteInvoice,
} = require('../controllers/invoice.controller');

// GET '/' = daftar invoice SATU event (?eventId= WAJIB sejak 2026-07-20 — dulu opsional & lintas-event,
// itu bug scoping, bukan desain). Karena eventId kini selalu ada, requireActivePro() default resolver
// membacanya dari query → gating Pro jadi PER-EVENT (sebelumnya jatuh ke fallback user-level).
router.get('/', verifyToken, requireActivePro(), getInvoices);
router.post('/generate', verifyToken, requireActivePro(fromInvoiceGenerate), generateInvoice);
router.get('/deal/:dealId', getInvoiceByDeal);  // public — sponsor client reads this
router.get('/:id', verifyToken, requireActivePro(fromInvoiceParam), getInvoice);
router.patch('/:id/status', verifyToken, requireActivePro(fromInvoiceParam), updateInvoiceStatus);
router.delete('/:id', verifyToken, requireActivePro(fromInvoiceParam), deleteInvoice);

module.exports = router;
