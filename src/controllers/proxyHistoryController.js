const { getProxyHistory } = require('../models/proxyModel');

async function listProxyHistory(req, res) {
  try {
    const history = await getProxyHistory(40);
    res.json({ history });
  } catch (error) {
    console.error('Unable to load proxy history:', error);
    res.status(500).json({ message: 'Could not load history.' });
  }
}

module.exports = {
  listProxyHistory,
};
