const express = require('express');
const router = express.Router();
const { getEventStorefront, createOrder, getOrderStatus } = require('../controllers/storefront.controller');

// Semua route di sini PUBLIC — tanpa verifyToken
router.get('/order/:orderId', getOrderStatus); // spesifik, harus di atas /:slug
router.get('/:slug', getEventStorefront);
router.post('/:slug/order', createOrder);

module.exports = router;
