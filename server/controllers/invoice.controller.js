const prisma = require('../src/lib/prisma');
// const PDFDocument = require('pdfkit'); // disabled: pdfkit not installed on VPS
const fs = require('fs');
const path = require('path');

const IDR = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatInvoiceNumber(count) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  return `INV-${String(count).padStart(3, '0')}-${dd}${mm}${yy}`;
}

async function nextInvoiceNumber() {
  const count = await prisma.sponsorInvoice.count();
  return formatInvoiceNumber(count + 1);
}

function invoicesDir() {
  const dir = path.join(__dirname, '..', 'public', 'invoices');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Generate PDF (stub: pdfkit not installed on VPS) ────────────────────────

// eslint-disable-next-line no-unused-vars
function buildPdf(_invoice, _outputPath) {
  return Promise.reject(new Error('PDF generation not available'));
}

// ─── Controllers ─────────────────────────────────────────────────────────────

// GET /api/invoices
async function getInvoices(req, res) {
  try {
    const invoices = await prisma.sponsorInvoice.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, invoiceNumber: true, sponsorName: true, contactName: true,
        grandTotal: true, status: true, currentTier: true, createdAt: true,
        pdfUrl: true, dealId: true,
      },
    });
    return res.json({ success: true, data: invoices });
  } catch (err) {
    console.error('[getInvoices]', err);
    return res.status(500).json({ success: false, message: 'Gagal memuat invoice.' });
  }
}

// GET /api/invoices/:id
async function getInvoice(req, res) {
  try {
    const invoice = await prisma.sponsorInvoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice tidak ditemukan.' });
    return res.json({ success: true, data: invoice });
  } catch (err) {
    console.error('[getInvoice]', err);
    return res.status(500).json({ success: false, message: 'Gagal memuat invoice.' });
  }
}

// GET /api/invoices/deal/:dealId — cek invoice by deal
async function getInvoiceByDeal(req, res) {
  try {
    const invoice = await prisma.sponsorInvoice.findFirst({
      where: { dealId: req.params.dealId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: invoice ?? null });
  } catch (err) {
    console.error('[getInvoiceByDeal]', err);
    return res.status(500).json({ success: false, message: 'Gagal memuat invoice.' });
  }
}

// POST /api/invoices/generate
async function generateInvoice(req, res) {
  try {
    const {
      dealId,
      promotorName,
      promotorLogo,
      bankName,
      bankAccount,
      accountHolder,
      bonusItems,      // string[]
      invoiceType,     // "sponsorship" | "tenant" | "ticket" | "manual"
      invoiceSource,   // "alacarte" | "bundling"
      packageId,       // id paket bundling, jika ada
      // items, grandTotal dikompute dari deal jika tidak disupply (untuk manual invoice)
      manualItems,     // optional: [{name, qty, unitPrice, subtotal}]
      manualGrandTotal,
    } = req.body;

    if (!dealId) return res.status(400).json({ success: false, message: 'dealId wajib diisi.' });
    if (!promotorName || !bankName || !bankAccount || !accountHolder) {
      return res.status(400).json({ success: false, message: 'Data promotor dan rekening wajib diisi.' });
    }

    // Ambil data deal
    const deal = await prisma.sponsorDeal.findUnique({
      where: { id: dealId },
      include: {
        dealBenefits: { include: { benefit: { select: { name: true, category: true } } } },
      },
    });
    if (!deal) return res.status(404).json({ success: false, message: 'Deal tidak ditemukan.' });

    // Hitung items
    let items = [];
    let grandTotal = 0;

    if (Array.isArray(manualItems) && manualItems.length > 0) {
      items = manualItems;
      grandTotal = manualGrandTotal ?? manualItems.reduce((s, i) => s + Number(i.subtotal), 0);
    } else if (deal.dealBenefits.length > 0) {
      items = deal.dealBenefits.map((db) => ({
        name: db.benefit.name,
        qty: db.qty,
        unitPrice: Number(db.unitPrice),
        subtotal: Number(db.totalPrice),
      }));
      grandTotal = Number(deal.totalValue);
    } else {
      // Deal tanpa benefit detail — pakai totalValue saja
      items = [{ name: `Paket Sponsorship – Tier ${deal.tier}`, qty: 1, unitPrice: Number(deal.totalValue), subtotal: Number(deal.totalValue) }];
      grandTotal = Number(deal.totalValue);
    }

    // Hitung diskon bundling
    const totalHargaSatuan = items.reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);
    const isBundle = invoiceSource === 'bundling' || packageId != null || deal.packageId != null;
    const diskon = isBundle ? Math.max(0, totalHargaSatuan - grandTotal) : 0;

    // Tier upgrade info
    const thresholds = await prisma.sponsorThreshold.findMany({ orderBy: { minPrice: 'asc' } });
    const currentThresh = thresholds.find((t) => t.tierName === deal.tier);
    const currentIdx = thresholds.findIndex((t) => t.tierName === deal.tier);
    const nextThresh = thresholds[currentIdx + 1] ?? null;
    const amountToUpgrade = nextThresh ? Math.max(0, Number(nextThresh.minPrice) - grandTotal) : null;

    const invoiceNumber = await nextInvoiceNumber();

    // Buat record dulu (tanpa pdfUrl)
    const invoice = await prisma.sponsorInvoice.create({
      data: {
        invoiceNumber,
        dealId,
        sponsorName: deal.sponsorName,
        sponsorEmail: deal.email,
        contactName: deal.contactName || deal.sponsorName,
        promotorName,
        promotorLogo: promotorLogo ?? null,
        bankName,
        bankAccount,
        accountHolder,
        items,
        grandTotal,
        itemsSubtotal: totalHargaSatuan,
        discount: diskon,
        invoiceSource: invoiceSource ?? 'alacarte',
        invoiceType: invoiceType ?? 'sponsorship',
        bonusItems: Array.isArray(bonusItems) ? bonusItems : [],
        currentTier: deal.tier,
        nextTier: nextThresh?.tierName ?? null,
        amountToUpgrade: amountToUpgrade && amountToUpgrade > 0 ? amountToUpgrade : null,
        status: 'Belum Dibayar',
      },
    });

    // PDF generation disabled on VPS — return invoice record without PDF
    return res.status(503).json({
      success: false,
      message: 'Invoice PDF generation coming soon. Install pdfkit on VPS to enable.',
      data: invoice,
    });
  } catch (err) {
    console.error('=== ERROR GENERATE INVOICE ===');
    console.error('Pesan:', err.message);
    console.error('Stack:', err.stack);
    return res.status(500).json({ success: false, message: err.message || 'Gagal generate invoice.' });
  }
}

// PATCH /api/invoices/:id/status
async function updateInvoiceStatus(req, res) {
  try {
    const { status } = req.body;
    const VALID_STATUS = ['Belum Dibayar', 'DP Terbayar', 'Lunas'];
    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({ success: false, message: `Status tidak valid. Gunakan: ${VALID_STATUS.join(', ')}` });
    }
    const updated = await prisma.sponsorInvoice.update({
      where: { id: req.params.id },
      data: {
        status,
        paidAt: status === 'Lunas' ? new Date() : null,
      },
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[updateInvoiceStatus]', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Invoice tidak ditemukan.' });
    }
    return res.status(500).json({ success: false, message: 'Gagal update status.' });
  }
}

// DELETE /api/invoices/:id
async function deleteInvoice(req, res) {
  try {
    const invoice = await prisma.sponsorInvoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice tidak ditemukan.' });
    // Hapus PDF jika ada
    if (invoice.pdfUrl) {
      const pdfPath = path.join(__dirname, '..', invoice.pdfUrl);
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    }
    await prisma.sponsorInvoice.delete({ where: { id: invoice.id } });
    return res.json({ success: true, message: 'Invoice dihapus.' });
  } catch (err) {
    console.error('[deleteInvoice]', err);
    return res.status(500).json({ success: false, message: 'Gagal hapus invoice.' });
  }
}

module.exports = {
  getInvoices,
  getInvoice,
  getInvoiceByDeal,
  generateInvoice,
  updateInvoiceStatus,
  deleteInvoice,
};
