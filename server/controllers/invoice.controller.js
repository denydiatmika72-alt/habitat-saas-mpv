const prisma = require('../src/lib/prisma');
const PDFDocument = require('pdfkit');
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

// ─── Generate PDF dengan pdfkit ───────────────────────────────────────────────

function buildPdf(invoice, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const pageW = doc.page.width;
    const marginL = 50;
    const marginR = 50;
    const contentW = pageW - marginL - marginR;

    // ── Header ─────────────────────────────────────────────────────────────
    doc.fillColor('#1e293b').fontSize(22).font('Helvetica-Bold').text('INVOICE', marginL, 50);
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#64748b')
      .text(`No: ${invoice.invoiceNumber}`, marginL, 78)
      .text(`Tanggal: ${new Date(invoice.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`, marginL, 93);

    // Promotor info — right aligned
    doc
      .font('Helvetica-Bold')
      .fillColor('#1e293b')
      .fontSize(12)
      .text(invoice.promotorName, marginL, 50, { width: contentW, align: 'right' });
    doc
      .font('Helvetica')
      .fillColor('#64748b')
      .fontSize(9)
      .text('Event Organizer', marginL, 68, { width: contentW, align: 'right' });

    // Divider
    doc.moveTo(marginL, 118).lineTo(pageW - marginR, 118).strokeColor('#e2e8f0').lineWidth(1).stroke();

    // ── Recipient ──────────────────────────────────────────────────────────
    doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('DITAGIHKAN KEPADA', marginL, 132);
    doc
      .fillColor('#1e293b')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(invoice.sponsorName, marginL, 146);
    doc
      .fillColor('#475569')
      .font('Helvetica')
      .fontSize(10)
      .text(`Perhatian: ${invoice.contactName}`, marginL, 162)
      .text(invoice.sponsorEmail, marginL, 176);

    // ── Bank info — right side ──────────────────────────────────────────────
    doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('TRANSFER KE', marginL, 132, { width: contentW, align: 'right' });
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(11)
      .text(invoice.bankName, marginL, 146, { width: contentW, align: 'right' });
    doc.fillColor('#475569').font('Helvetica').fontSize(10)
      .text(`No. Rek: ${invoice.bankAccount}`, marginL, 162, { width: contentW, align: 'right' })
      .text(`A/N: ${invoice.accountHolder}`, marginL, 176, { width: contentW, align: 'right' });

    // Divider
    doc.moveTo(marginL, 200).lineTo(pageW - marginR, 200).strokeColor('#e2e8f0').lineWidth(1).stroke();

    // ── Tabel Benefit ──────────────────────────────────────────────────────
    const tableTop = 215;
    const col = { no: marginL, item: marginL + 24, qty: marginL + contentW * 0.55, price: marginL + contentW * 0.70, total: marginL + contentW * 0.85 };

    // Header baris tabel
    doc.rect(marginL, tableTop, contentW, 22).fill('#1e293b');
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('#', col.no, tableTop + 7)
      .text('ITEM / BENEFIT', col.item, tableTop + 7)
      .text('QTY', col.qty, tableTop + 7, { width: 50, align: 'right' })
      .text('HARGA SATUAN', col.price, tableTop + 7, { width: 70, align: 'right' })
      .text('SUBTOTAL', col.total, tableTop + 7, { width: contentW - (col.total - marginL), align: 'right' });

    const items = Array.isArray(invoice.items) ? invoice.items : [];
    let rowY = tableTop + 22;

    items.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
      doc.rect(marginL, rowY, contentW, 20).fill(bg);

      doc
        .fillColor('#475569')
        .font('Helvetica')
        .fontSize(9)
        .text(String(idx + 1), col.no, rowY + 6)
        .text(item.name, col.item, rowY + 6, { width: col.qty - col.item - 8 })
        .text(String(item.qty), col.qty, rowY + 6, { width: 50, align: 'right' })
        .text(IDR.format(Number(item.unitPrice)), col.price, rowY + 6, { width: 70, align: 'right' })
        .text(IDR.format(Number(item.subtotal)), col.total, rowY + 6, { width: contentW - (col.total - marginL), align: 'right' });

      rowY += 20;
    });

    // Grand Total
    rowY += 6;
    doc.rect(marginL, rowY, contentW, 28).fill('#1e293b');
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('TOTAL INVESTASI', col.item, rowY + 8)
      .text(IDR.format(Number(invoice.grandTotal)), col.total, rowY + 8, { width: contentW - (col.total - marginL), align: 'right' });

    rowY += 40;

    // ── Tier Upgrade ──────────────────────────────────────────────────────
    if (invoice.nextTier && invoice.amountToUpgrade) {
      doc.rect(marginL, rowY, contentW, 46).fill('#f0fdf4');
      doc.rect(marginL, rowY, 4, 46).fill('#22c55e');
      doc
        .fillColor('#166534')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('UPGRADE TIER', marginL + 14, rowY + 8);
      doc
        .fillColor('#166534')
        .font('Helvetica')
        .fontSize(9)
        .text(
          `Tambah ${IDR.format(Number(invoice.amountToUpgrade))} lagi untuk naik ke tier ${invoice.nextTier} dan dapatkan lebih banyak benefit!`,
          marginL + 14,
          rowY + 23,
          { width: contentW - 20 }
        );
      rowY += 58;
    }

    // ── Bonus Items ───────────────────────────────────────────────────────
    const bonusItems = Array.isArray(invoice.bonusItems) ? invoice.bonusItems : [];
    if (bonusItems.length > 0) {
      doc
        .fillColor('#7c3aed')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('BONUS EKSKLUSIF UNTUK ANDA', marginL, rowY);
      rowY += 14;

      bonusItems.forEach((bonus) => {
        doc
          .fillColor('#4c1d95')
          .font('Helvetica')
          .fontSize(9)
          .text(`• ${bonus}`, marginL + 8, rowY, { width: contentW });
        rowY += 14;
      });
      rowY += 6;
    }

    // ── Footer ─────────────────────────────────────────────────────────────
    doc.moveTo(marginL, rowY + 10).lineTo(pageW - marginR, rowY + 10).strokeColor('#e2e8f0').lineWidth(1).stroke();
    doc
      .fillColor('#94a3b8')
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Invoice ini dibuat secara otomatis oleh sistem Habitat • ${invoice.promotorName}`,
        marginL,
        rowY + 20,
        { width: contentW, align: 'center' }
      );

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
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
        invoiceType: invoiceType ?? 'sponsorship',
        bonusItems: Array.isArray(bonusItems) ? bonusItems : [],
        currentTier: deal.tier,
        nextTier: nextThresh?.tierName ?? null,
        amountToUpgrade: amountToUpgrade && amountToUpgrade > 0 ? amountToUpgrade : null,
        status: 'Belum Dibayar',
      },
    });

    // Generate PDF
    const filename = `${invoice.id}.pdf`;
    const outputPath = path.join(invoicesDir(), filename);
    await buildPdf(invoice, outputPath);

    // Update pdfUrl
    const pdfUrl = `/public/invoices/${filename}`;
    await prisma.sponsorInvoice.update({ where: { id: invoice.id }, data: { pdfUrl } });

    return res.json({ success: true, data: { ...invoice, pdfUrl }, message: 'Invoice berhasil dibuat.' });
  } catch (err) {
    console.error('[generateInvoice]', err);
    return res.status(500).json({ success: false, message: 'Gagal generate invoice.' });
  }
}

// PATCH /api/invoices/:id/status
async function updateInvoiceStatus(req, res) {
  try {
    const { status } = req.body;
    const allowed = ['Belum Dibayar', 'Sudah Dibayar', 'Jatuh Tempo'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Status tidak valid. Gunakan: ${allowed.join(', ')}` });
    }
    const updated = await prisma.sponsorInvoice.update({ where: { id: req.params.id }, data: { status } });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[updateInvoiceStatus]', err);
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
