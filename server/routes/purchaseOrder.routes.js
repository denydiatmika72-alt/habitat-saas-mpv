const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { requireActivePro, fromPOParam } = require('../middleware/pro.middleware');
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

// Purchase Order = fitur Pro per-event. Create/list via eventId (body/query); operasi by-:id via PO.eventId.
router.post('/',                       verifyToken, requireActivePro(),            createPO);
router.get('/',                        verifyToken, requireActivePro(),            getPOsByEvent);
router.get('/:id/pdf',                 verifyToken, requireActivePro(fromPOParam), generatePurchaseOrderPdf);
router.get('/:id',                     verifyToken, requireActivePro(fromPOParam), getPOById);
router.put('/:id',                     verifyToken, requireActivePro(fromPOParam), updatePO);
router.delete('/:id',                  verifyToken, requireActivePro(fromPOParam), deletePO);
router.post('/:id/items',              verifyToken, requireActivePro(fromPOParam), addPOItem);
router.delete('/:id/items/:itemId',    verifyToken, requireActivePro(fromPOParam), deletePOItem);

module.exports = router;
