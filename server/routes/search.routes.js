const express = require('express');
const router = express.Router();
const { verifyToken } = require('../src/middleware/auth.middleware');
const { globalSearch } = require('../controllers/search.controller');

// Pencarian global top-bar. SENGAJA TANPA requireActivePro: ini navigasi dasar
// atas data milik promotor sendiri (event Starter-accessible; hasil deal sponsor
// hanya mengantar ke hub Kerjasama yang menampilkan lock Pro-nya sendiri).
router.get('/', verifyToken, globalSearch);

module.exports = router;
