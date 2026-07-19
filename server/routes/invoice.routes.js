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

// GET '/' = feed agregat Document Table (lintas-event, ?eventId= opsional) — cek Pro user pemanggil.
// Frontend (document-table) sudah menelan kegagalan jadi list kosong, jadi 402 aman untuk Starter.
router.get('/', verifyToken, requireActivePro(), getInvoices);
router.post('/generate', verifyToken, requireActivePro(fromInvoiceGenerate), generateInvoice);
router.get('/deal/:dealId', getInvoiceByDeal);  // public — sponsor client reads this
router.get('/:id', verifyToken, requireActivePro(fromInvoiceParam), getInvoice);
router.patch('/:id/status', verifyToken, requireActivePro(fromInvoiceParam), updateInvoiceStatus);
router.delete('/:id', verifyToken, requireActivePro(fromInvoiceParam), deleteInvoice);

module.exports = router;
