require('dotenv/config');

if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const express = require('express');
const cors = require('cors');

const path = require('path');
const authRoutes          = require('./routes/auth.routes');
const eventRoutes         = require('../routes/event.routes');
const budgetRoutes        = require('../routes/budget.routes');
const sponsorRoutes       = require('../routes/sponsor.routes');
const invoiceRoutes       = require('../routes/invoice.routes');
const settingsRoutes      = require('../routes/settings.routes');
const purchaseOrderRoutes = require('../routes/purchaseOrder.routes');

const app = express();
const PORT = process.env.PORT || 5000;

const corsOptions = {
  origin: ['http://localhost:3000', process.env.CLIENT_URL].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition', 'Content-Type'],
};
app.use(cors(corsOptions));
app.options(/(.*)/, cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (generated invoices)
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => res.json({ success: true, message: '🎵 Habitat API is running!' }));

app.use('/api/auth',     authRoutes);
app.use('/api/events',   eventRoutes);
app.use('/api/budgets',  budgetRoutes);
app.use('/api/sponsor',  sponsorRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/po',       purchaseOrderRoutes);

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
