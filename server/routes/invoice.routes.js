const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const {
  getInvoices,
  getInvoice,
  getInvoiceByDeal,
  generateInvoice,
  updateInvoiceStatus,
  deleteInvoice,
} = require('../controllers/invoice.controller');

router.get('/', verifyToken, getInvoices);
router.post('/generate', verifyToken, generateInvoice);
router.get('/deal/:dealId', getInvoiceByDeal);  // public — sponsor client reads this
router.get('/:id', verifyToken, getInvoice);
router.patch('/:id/status', verifyToken, updateInvoiceStatus);
router.delete('/:id', verifyToken, deleteInvoice);

module.exports = router;
