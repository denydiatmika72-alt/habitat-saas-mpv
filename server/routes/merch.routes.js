const express = require('express');
const router = express.Router();
const { verifyToken } = require('../src/middleware/auth.middleware');
const {
  createMerchItem,
  updateMerchItem,
  updateVariantStock,
  deleteMerchItem,
  getMerchItems,
  uploadMerchImage,
} = require('../controllers/merch.controller');

router.get('/items', verifyToken, getMerchItems);
router.post('/items', verifyToken, createMerchItem);
router.patch('/items/:id', verifyToken, updateMerchItem);
router.delete('/items/:id', verifyToken, deleteMerchItem);
router.patch('/variants/:id', verifyToken, updateVariantStock);
router.post('/items/:id/image', verifyToken, uploadMerchImage);

module.exports = router;
