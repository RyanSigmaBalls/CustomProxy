const { createBookmark, getBookmarks, deleteBookmark } = require('../models/proxyModel');

async function addBookmark(req, res) {
  try {
    const { title, url, notes } = req.body;
    if (!title || !url) {
      return res.status(400).json({ message: 'Title and URL are required.' });
    }
    const bookmark = await createBookmark({ title, url, notes });
    res.status(201).json({ bookmark });
  } catch (error) {
    console.error('Bookmark creation failed:', error);
    res.status(500).json({ message: 'Could not save bookmark.' });
  }
}

async function listBookmarks(req, res) {
  try {
    const bookmarks = await getBookmarks();
    res.json({ bookmarks });
  } catch (error) {
    console.error('Unable to load bookmarks:', error);
    res.status(500).json({ message: 'Could not load bookmarks.' });
  }
}

async function removeBookmark(req, res) {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: 'Bookmark id is required.' });
    const changes = await deleteBookmark(id);
    res.json({ message: changes ? 'Bookmark removed.' : 'No bookmark removed.' });
  } catch (error) {
    console.error('Bookmark delete failed:', error);
    res.status(500).json({ message: 'Could not remove bookmark.' });
  }
}

module.exports = {
  addBookmark,
  listBookmarks,
  removeBookmark,
};
