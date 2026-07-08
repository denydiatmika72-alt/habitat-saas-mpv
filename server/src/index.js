require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), override: true })

if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const express = require('express');
const cors = require('cors');

const path = require('path');
const authRoutes          = require('./routes/auth.routes');
const adminRoutes         = require('./routes/admin.routes');
const publicEventsRoutes  = require('../routes/publicEvents.routes');
const eventRoutes         = require('../routes/event.routes');
const budgetRoutes        = require('../routes/budget.routes');
const sponsorRoutes       = require('../routes/sponsor.routes');
const invoiceRoutes       = require('../routes/invoice.routes');
const settingsRoutes      = require('../routes/settings.routes');
const purchaseOrderRoutes = require('../routes/purchaseOrder.routes');
const usersRoutes         = require('../routes/users.routes');
const expensesRoutes      = require('../routes/expenses.routes');
const crewRoutes          = require('../routes/crew.routes');
const pettyCashRoutes     = require('../routes/pettycash.routes');
const plReportRoutes      = require('../routes/pl-report.routes');
const otherIncomeRoutes   = require('../routes/other-income.routes');
const paymentRoutes       = require('../routes/payment.routes');
const storefrontRoutes    = require('../routes/storefront.routes');
const ticketRoutes        = require('../routes/ticket.routes');
const merchRoutes         = require('../routes/merch.routes');
const bundleRoutes        = require('../routes/bundle.routes');
const ticketBoxRoutes     = require('../routes/ticket-box.routes');
const feeDebtRoutes       = require('../routes/fee-debt.routes');
const scannerRoutes       = require('../routes/scanner.routes');
const { payoutRoutes, adminPayoutRoutes } = require('../routes/payout.routes');
const uploadRoutes        = require('../routes/upload.routes');
require('./cron/pro-subscription.cron');
require('./cron/ticket-booking.cron');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'https://nexeventapp.tech',
  'https://www.nexeventapp.tech',
  'http://localhost:3000',
  process.env.CLIENT_URL
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition', 'Content-Type'],
};
app.use(cors(corsOptions));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.options(/(.*)/, cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (generated invoices)
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => res.json({ success: true, message: '🎵 nexEvent API is running!' }));

app.use('/api/auth',          authRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/events/public', publicEventsRoutes);
app.use('/api/events',        eventRoutes);
app.use('/api/budgets',       budgetRoutes);
app.use('/api/sponsor',       sponsorRoutes);
app.use('/api/invoices',      invoiceRoutes);
app.use('/api/settings',      settingsRoutes);
app.use('/api/po',            purchaseOrderRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api/expenses',      expensesRoutes);
app.use('/api/crew',          crewRoutes);
app.use('/api/petty-cash',    pettyCashRoutes);
app.use('/api/pl-report',     plReportRoutes);
app.use('/api/other-income',  otherIncomeRoutes);
app.use('/api/payments',      paymentRoutes);
app.use('/api/storefront',    storefrontRoutes);
app.use('/api/tickets',       ticketRoutes);
app.use('/api/merch',         merchRoutes);
app.use('/api/bundles',       bundleRoutes);
app.use('/api/ticket-box',    ticketBoxRoutes);
app.use('/api/admin/fee-debt', feeDebtRoutes);
app.use('/api/scanner',       scannerRoutes);
app.use('/api/payout',        payoutRoutes);
app.use('/api/admin/payout',  adminPayoutRoutes);
app.use('/api/upload',        uploadRoutes);

app.use((req, res) => {
  console.warn('[404] Route tidak ditemukan:', req.method, req.originalUrl);
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} tidak ditemukan.` });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 nexEvent API berjalan di http://localhost:${PORT}`);
  console.log(`⏰ ${new Date().toLocaleString('id-ID')}\n`);
});

module.exports = app;
