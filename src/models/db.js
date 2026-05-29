const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const dataDir = path.resolve(__dirname, '../../data');
const dbPath = path.resolve(dataDir, 'app.db');
const adminEmail = 'admin@customproxy.local';
const adminPassword = 'admin123';

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    process.exit(1);
  }
});

function initDatabase() {
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        displayName TEXT NOT NULL,
        isAdmin INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        query TEXT NOT NULL,
        resultsCount INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id)
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS site_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        metadata TEXT,
        createdAt TEXT NOT NULL
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        notes TEXT,
        createdAt TEXT NOT NULL
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS proxy_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        targetUrl TEXT NOT NULL,
        pageTitle TEXT,
        statusCode INTEGER,
        createdAt TEXT NOT NULL
      )`
    );

    const now = new Date().toISOString();
    const sql = 'SELECT id FROM users WHERE email = ? LIMIT 1';
    db.get(sql, [adminEmail], async (err, entry) => {
      if (err) {
        console.error('Error checking admin account:', err.message);
        return;
      }

      if (!entry) {
        const hashed = await bcrypt.hash(adminPassword, 10);
        db.run(
          `INSERT INTO users (email, password, displayName, isAdmin, createdAt)
           VALUES (?, ?, ?, 1, ?)`,
          [adminEmail, hashed, 'CustomProxy Admin', now],
          (error) => {
            if (error) {
              console.error('Failed to create default admin:', error.message);
            }
          }
        );
      }
    });
  });
}

module.exports = {
  db,
  initDatabase,
};
