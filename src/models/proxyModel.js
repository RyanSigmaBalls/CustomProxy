const { db } = require('./db');

function addProxyHistory({ targetUrl, pageTitle, statusCode }) {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const sql = `INSERT INTO proxy_history (targetUrl, pageTitle, statusCode, createdAt) VALUES (?, ?, ?, ?)`;
    db.run(sql, [targetUrl, pageTitle, statusCode, createdAt], function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, targetUrl, pageTitle, statusCode, createdAt });
    });
  });
}

function getProxyHistory(limit = 20) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT id, targetUrl, pageTitle, statusCode, createdAt FROM proxy_history ORDER BY createdAt DESC LIMIT ?`, [limit], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function createBookmark({ title, url, notes = '' }) {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const sql = `INSERT INTO bookmarks (title, url, notes, createdAt) VALUES (?, ?, ?, ?)`;
    db.run(sql, [title, url, notes, createdAt], function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, title, url, notes, createdAt });
    });
  });
}

function getBookmarks() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT id, title, url, notes, createdAt FROM bookmarks ORDER BY createdAt DESC`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function deleteBookmark(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM bookmarks WHERE id = ?`, [id], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

module.exports = {
  addProxyHistory,
  getProxyHistory,
  createBookmark,
  getBookmarks,
  deleteBookmark,
};
