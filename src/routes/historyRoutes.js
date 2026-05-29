const express = require('express');
const { listProxyHistory } = require('../controllers/proxyHistoryController');
const router = express.Router();

router.get('/', listProxyHistory);

module.exports = router;
