const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const dotenv = require('dotenv');
const morgan = require('morgan');

const authRoutes = require('./routes/authRoutes');
const searchRoutes = require('./routes/searchRoutes');
const adminRoutes = require('./routes/adminRoutes');
const proxyRoutes = require('./routes/proxyRoutes');
const serviceProxy = require('./middleware/reverseProxy');
const bookmarkRoutes = require('./routes/bookmarkRoutes');
const historyRoutes = require('./routes/historyRoutes');
const { initDatabase } = require('./models/db');
const { securityHeaders } = require('./middleware/securityMiddleware');

dotenv.config();

const app = express();

// Initialize the database and default admin account.
initDatabase();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('tiny'));
app.use(securityHeaders);

app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, '../data') }),
    secret: process.env.SESSION_SECRET || 'customproxy_secret_change_me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth', authRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/history', historyRoutes);
// legacy simple proxy route (kept for compatibility)
app.use('/proxy', proxyRoutes);

// main reverse proxy service that handles full proxying at /service/*
app.use('/service', serviceProxy);

app.get(['/', '/login', '/signup', '/search', '/admin', '/history', '/bookmarks', '/blank'], (req, res) => {
  const routeMap = {
    '/': 'index.html',
    '/login': 'login.html',
    '/signup': 'signup.html',
    '/search': 'search.html',
    '/admin': 'admin.html',
    '/history': 'history.html',
    '/bookmarks': 'bookmarks.html',
    '/blank': 'blank.html',
  };
  res.sendFile(path.join(__dirname, '../public', routeMap[req.path]));
});

app.use((req, res) => {
  res.status(404).json({ message: 'Resource not found' });
});

module.exports = app;
