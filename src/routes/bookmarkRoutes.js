const express = require('express');
const { addBookmark, listBookmarks, removeBookmark } = require('../controllers/bookmarkController');
const router = express.Router();

router.get('/', listBookmarks);
router.post('/', addBookmark);
router.post('/delete', removeBookmark);

module.exports = router;
