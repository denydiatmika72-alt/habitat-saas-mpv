const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const {
  createPO,
  getPOsByEvent,
  getPOById,
  updatePO,
  deletePO,
  addPOItem,
  deletePOItem,
  generatePurchaseOrderPdf,
} = require('../controllers/purchaseOrder.controller');

router.post('/',                       verifyToken, createPO);
router.get('/',                        verifyToken, getPOsByEvent);
router.get('/:id/pdf',                 verifyToken, generatePurchaseOrderPdf);
router.get('/:id',                     verifyToken, getPOById);
router.put('/:id',                     verifyToken, updatePO);
router.delete('/:id',                  verifyToken, deletePO);
router.post('/:id/items',              verifyToken, addPOItem);
router.delete('/:id/items/:itemId',    verifyToken, deletePOItem);

module.exports = router;
