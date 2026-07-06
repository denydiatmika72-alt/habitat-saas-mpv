const express = require('express');
const router = express.Router();
const { verifyToken } = require('../src/middleware/auth.middleware');
const {
  createBundle,
  updateBundle,
  deleteBundle,
  getBundles,
  uploadBundleImage,
} = require('../controllers/bundle.controller');

router.get('/', verifyToken, getBundles);
router.post('/', verifyToken, createBundle);
router.patch('/:id', verifyToken, updateBundle);
router.delete('/:id', verifyToken, deleteBundle);
router.post('/:id/image', verifyToken, uploadBundleImage);

module.exports = router;
