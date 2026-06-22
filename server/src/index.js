require('dotenv/config');

if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const express = require('express');
const cors = require('cors');

const authRoutes    = require('./routes/auth.routes');
const eventRoutes   = require('../routes/event.routes');
const budgetRoutes  = require('../routes/budget.routes');
const sponsorRoutes = require('../routes/sponsor.routes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.json({ success: true, message: '🎵 Habitat API is running!' }));

app.use('/api/auth',    authRoutes);
app.use('/api/events',  eventRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/sponsor', sponsorRoutes);

app.use((req, res) => res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} tidak ditemukan.` }));

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Habitat API berjalan di http://localhost:${PORT}`);
  console.log(`⏰ ${new Date().toLocaleString('id-ID')}\n`);
});

module.exports = app;
