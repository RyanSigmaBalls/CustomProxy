const express = require('express');
const { proxyHandler } = require('../controllers/proxyController');
const router = express.Router();

router.get('/', proxyHandler);

module.exports = router;
