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
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const pageW = doc.page.width;
    const mL = 50;
    const mR = 50;
    const cW = pageW - mL - mR;

    const tanggalTerbit = new Date(invoice.createdAt).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    const COL = {
      no:    { x: mL,        w: 20  },
      item:  { x: mL + 22,   w: 215 },
      qty:   { x: mL + 240,  w: 35  },
      price: { x: mL + 280,  w: 110 },
      sub:   { x: mL + 395,  w: 100 },
    };

    let y = 50;

    // ── SECTION 1: HEADER ─────────────────────────────────────────────────────

    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(14)
       .text(invoice.promotorName, mL, y, { width: cW / 2, lineBreak: false });
    doc.fillColor('#64748b').font('Helvetica').fontSize(10)
       .text('Event Organizer', mL, y + 20, { width: cW / 2, lineBreak: false });

    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(14)
       .text('INVOICE SPONSORSHIP', mL, y, { width: cW, align: 'right', lineBreak: false });
    doc.fillColor('#64748b').font('Helvetica').fontSize(10)
       .text(invoice.invoiceNumber, mL, y + 20, { width: cW, align: 'right', lineBreak: false });

    y += 46;

    doc.moveTo(mL, y).lineTo(pageW - mR, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    y += 20;

    // ── SECTION 2: INFO PENAGIHAN ──────────────────────────────────────────────

    const halfW = Math.floor(cW / 2) - 10;
    const rightX = mL + Math.floor(cW / 2) + 10;

    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text('DITAGIHKAN KEPADA', mL, y, { width: halfW, lineBreak: false });
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(12)
       .text(invoice.sponsorName, mL, y + 13, { width: halfW, lineBreak: false });
    doc.fillColor('#475569').font('Helvetica').fontSize(10)
       .text(`Perhatian: ${invoice.contactName}`, mL, y + 30, { width: halfW, lineBreak: false });
    doc.fillColor('#475569').font('Helvetica').fontSize(10)
       .text(invoice.sponsorEmail || '-', mL, y + 44, { width: halfW, lineBreak: false });

    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text('TRANSFER KE', rightX, y, { width: halfW, lineBreak: false });
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10)
       .text(invoice.bankName, rightX, y + 13, { width: halfW, lineBreak: false });
    doc.fillColor('#475569').font('Helvetica').fontSize(10)
       .text(`No. Rek: ${invoice.bankAccount}`, rightX, y + 30, { width: halfW, lineBreak: false });
    doc.fillColor('#475569').font('Helvetica').fontSize(10)
       .text(`A/N: ${invoice.accountHolder}`, rightX, y + 44, { width: halfW, lineBreak: false });

    y += 66;

    doc.moveTo(mL, y).lineTo(pageW - mR, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    y += 20;

    // ── SECTION 3: TABEL BENEFIT ──────────────────────────────────────────────

    const ROW_H  = 22;
    const HEAD_H = 26;

    doc.rect(mL, y, cW, HEAD_H).fill('#1a1a2e');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
       .text('#',              COL.no.x + 2,    y + 9, { width: COL.no.w,    lineBreak: false });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
       .text('ITEM / BENEFIT', COL.item.x,      y + 9, { width: COL.item.w,  lineBreak: false });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
       .text('QTY',            COL.qty.x,        y + 9, { width: COL.qty.w,   align: 'right', lineBreak: false });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
       .text('HARGA SATUAN',   COL.price.x,      y + 9, { width: COL.price.w, align: 'right', lineBreak: false });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
       .text('SUBTOTAL',       COL.sub.x,        y + 9, { width: COL.sub.w,   align: 'right', lineBreak: false });
    y += HEAD_H;

    const items = Array.isArray(invoice.items) ? invoice.items : [];
    items.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? '#f1f5f9' : '#ffffff';
      doc.rect(mL, y, cW, ROW_H).fill(bg);
      doc.fillColor('#374151').font('Helvetica').fontSize(9)
         .text(String(idx + 1), COL.no.x + 2, y + 7, { width: COL.no.w, lineBreak: false });
      doc.fillColor('#374151').font('Helvetica').fontSize(9)
         .text(item.name, COL.item.x, y + 7, { width: COL.item.w, lineBreak: false });
      doc.fillColor('#374151').font('Helvetica').fontSize(9)
         .text(String(item.qty), COL.qty.x, y + 7, { width: COL.qty.w, align: 'right', lineBreak: false });
      doc.fillColor('#374151').font('Helvetica').fontSize(9)
         .text(IDR.format(Number(item.unitPrice)), COL.price.x, y + 7, { width: COL.price.w, align: 'right', lineBreak: false });
      doc.fillColor('#374151').font('Helvetica').fontSize(9)
         .text(IDR.format(Number(item.subtotal)), COL.sub.x, y + 7, { width: COL.sub.w, align: 'right', lineBreak: false });
      y += ROW_H;
    });

    doc.moveTo(mL, y).lineTo(pageW - mR, y).strokeColor('#94a3b8').lineWidth(0.5).stroke();

    const adaDiskon = Number(invoice.discount) > 0;
    const itemsSubtotalAmt = Number(invoice.itemsSubtotal);
    const diskonAmt = Number(invoice.discount);

    if (adaDiskon) {
      y += 10;

      doc.fontSize(10).font('Helvetica').fillColor('#555555')
         .text('Subtotal Item', COL.item.x, y, {
           width: COL.item.w + COL.qty.w + COL.price.w + 5, lineBreak: false,
         });
      doc.fontSize(10).font('Helvetica').fillColor('#555555')
         .text(IDR.format(itemsSubtotalAmt), COL.sub.x, y, {
           width: COL.sub.w, align: 'right', lineBreak: false,
         });
      y += 20;

      doc.fontSize(10).font('Helvetica').fillColor('#16a34a')
         .text('Diskon Bundling Paket', COL.item.x, y, {
           width: COL.item.w + COL.qty.w + COL.price.w + 5, lineBreak: false,
         });
      doc.fontSize(10).font('Helvetica').fillColor('#16a34a')
         .text('- ' + IDR.format(diskonAmt), COL.sub.x, y, {
           width: COL.sub.w, align: 'right', lineBreak: false,
         });
      y += 10;

      doc.moveTo(COL.sub.x - 5, y).lineTo(pageW - mR, y).strokeColor('#cccccc').lineWidth(0.5).stroke();
      y += 10;
    }

    const TOTAL_H = 32;
    doc.rect(mL, y, cW, TOTAL_H).fill('#1a1a2e');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
       .text('TOTAL INVESTASI', COL.item.x, y + 11, {
         width: COL.item.w + COL.qty.w + COL.price.w + 5,
         lineBreak: false,
       });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
       .text(IDR.format(Number(invoice.grandTotal)), COL.sub.x, y + 11, {
         width: COL.sub.w,
         align: 'right',
         lineBreak: false,
       });
    y += TOTAL_H + 18;

    // ── SECTION 4: SPONSORSHIP INVESTMENT STATUS ──────────────────────────────

    const hasUpgrade = invoice.nextTier && Number(invoice.amountToUpgrade) > 0;
    const BOX_H = hasUpgrade ? 64 : 48;

    doc.rect(mL, y, cW, BOX_H).fill('#f8fafc');
    doc.rect(mL, y, cW, BOX_H).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10)
       .text('SPONSORSHIP INVESTMENT STATUS', mL + 12, y + 10, { width: cW - 24, lineBreak: false });
    doc.fillColor('#374151').font('Helvetica').fontSize(10)
       .text(`Status level saat ini: ${invoice.currentTier}`, mL + 12, y + 26, { width: cW - 24, lineBreak: false });

    if (hasUpgrade) {
      doc.fillColor('#374151').font('Helvetica-Oblique').fontSize(9)
         .text(
           `Tambah ${IDR.format(Number(invoice.amountToUpgrade))} lagi untuk naik ke tier ${invoice.nextTier} dan dapatkan lebih banyak benefit!`,
           mL + 12, y + 42, { width: cW - 24, lineBreak: false }
         );
    } else {
      doc.fillColor('#166534').font('Helvetica-Oblique').fontSize(9)
         .text('Selamat! Anda telah mencapai status tertinggi.', mL + 12, y + 42, { width: cW - 24, lineBreak: false });
    }
    y += BOX_H + 18;

    // ── SECTION 5: BONUS BENEFIT (opsional) ───────────────────────────────────

    const bonusItems = Array.isArray(invoice.bonusItems) ? invoice.bonusItems : [];
    if (bonusItems.length > 0) {
      doc.fillColor('#4c1d95').font('Helvetica-Bold').fontSize(10)
         .text('BONUS / DISKON BENEFIT', mL, y, { width: cW, lineBreak: false });
      y += 16;
      bonusItems.forEach((bonus) => {
        doc.fillColor('#4c1d95').font('Helvetica').fontSize(9)
           .text(`• ${bonus}`, mL + 8, y, { width: cW - 8, lineBreak: false });
        y += 14;
      });
      y += 8;
    }

    // ── SECTION 6: FOOTER ─────────────────────────────────────────────────────

    y += 10;
    doc.moveTo(mL, y).lineTo(pageW - mR, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    y += 14;
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text(
         `Invoice ini dibuat secara otomatis oleh sistem ${invoice.promotorName}`,
         mL, y, { width: cW, align: 'center', lineBreak: false }
       );
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text(
         `Diterbitkan pada ${tanggalTerbit}`,
         mL, y + 12, { width: cW, align: 'center', lineBreak: false }
       );

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// ─── Controllers ─────────────────────────────────────────────────────────────

// GET /api/invoices  (opsional ?eventId= untuk scope per-event)
async function getInvoices(req, res) {
  try {
    // Isolasi per-promotor WAJIB: SELALU filter promotorId (menutup kebocoran lintas akun — dulu findMany
    // tanpa where sama sekali). eventId opsional: kalau caller mengirim ?eventId= → scope tambahan ke event
    // itu; kalau tidak → daftar lintas-event milik promotor (dipakai "Semua Invoice" & Document Table).
    const { eventId } = req.query;
    const where = {
      promotorId: req.user.id,
      ...(eventId ? { eventId } : {}),
    };
    const invoices = await prisma.sponsorInvoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, invoiceNumber: true, sponsorName: true, contactName: true,
        grandTotal: true, status: true, currentTier: true, createdAt: true,
        pdfUrl: true, dealId: true, eventId: true,
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
    if (invoice.promotorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke invoice ini.' });
    }
    return res.json({ success: true, data: invoice });
  } catch (err) {
    console.error('[getInvoice]', err);
    return res.status(500).json({ success: false, message: 'Gagal memuat invoice.' });
  }
}

// GET /api/invoices/deal/:dealId
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
      eventId: bodyEventId,
      promotorName,
      promotorLogo,
      bankName,
      bankAccount,
      accountHolder,
      bonusItems,
      invoiceType,
      invoiceSource,
      packageId,
      manualItems,
      manualGrandTotal,
      sponsorName: bodySponsorName,
      sponsorEmail: bodySponsorEmail,
      contactName: bodyContactName,
    } = req.body;

    if (!promotorName || !bankName || !bankAccount || !accountHolder) {
      return res.status(400).json({ success: false, message: 'Data promotor dan rekening wajib diisi.' });
    }

    // Pemilik SELALU dari sesi — jangan pernah dari body client.
    const promotorId = req.user.id;

    // eventId & pemilik diturunkan SERVER-SIDE dari resource tepercaya, tidak pernah dari deals[0]:
    //  - Invoice sponsorship (ada dealId): eventId dari deal.eventId + verifikasi deal milik promotor (tutup IDOR).
    //  - Invoice manual (tanpa dealId): eventId dari body (event yang dipilih promotor) + verifikasi kepemilikan event.
    let deal = null;
    let eventId = null;

    if (dealId) {
      deal = await prisma.sponsorDeal.findUnique({
        where: { id: dealId },
        include: {
          dealBenefits: { include: { benefit: { select: { name: true, category: true } } } },
        },
      });
      if (!deal) return res.status(404).json({ success: false, message: 'Deal tidak ditemukan.' });
      if (deal.promotorId !== promotorId) {
        return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke deal ini.' });
      }
      eventId = deal.eventId;
    } else {
      if (!bodyEventId) {
        return res.status(400).json({ success: false, message: 'eventId wajib diisi untuk invoice manual.' });
      }
      const event = await prisma.event.findUnique({
        where: { id: bodyEventId },
        select: { id: true, promotor_id: true },
      });
      if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
      if (event.promotor_id !== promotorId) {
        return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke event ini.' });
      }
      eventId = event.id;
    }

    let items = [];
    let grandTotal = 0;

    if (Array.isArray(manualItems) && manualItems.length > 0) {
      items = manualItems;
      grandTotal = manualGrandTotal ?? manualItems.reduce((s, i) => s + Number(i.subtotal), 0);
    } else if (deal && deal.dealBenefits.length > 0) {
      items = deal.dealBenefits.map((db) => ({
        name: db.benefit.name,
        qty: db.qty,
        unitPrice: Number(db.unitPrice),
        subtotal: Number(db.totalPrice),
      }));
      grandTotal = Number(deal.totalValue);
    } else if (deal) {
      items = [{ name: `Paket Sponsorship – Tier ${deal.tier}`, qty: 1, unitPrice: Number(deal.totalValue), subtotal: Number(deal.totalValue) }];
      grandTotal = Number(deal.totalValue);
    } else {
      return res.status(400).json({ success: false, message: 'Invoice manual harus memiliki minimal 1 item.' });
    }

    const totalHargaSatuan = items.reduce((sum, item) => sum + (Number(item.unitPrice) * Number(item.qty)), 0);
    const isBundle = invoiceSource === 'bundling' || packageId != null || (deal && deal.packageId != null);
    const diskon = isBundle ? Math.max(0, totalHargaSatuan - grandTotal) : 0;

    // Tier/threshold hanya relevan untuk invoice sponsorship (punya deal.tier).
    // Threshold difilter promotorId — cegah kalkulasi tier memakai config promotor lain.
    let nextThresh = null;
    let amountToUpgrade = null;
    if (deal) {
      const thresholds = await prisma.sponsorThreshold.findMany({
        where: { promotorId },
        orderBy: { minPrice: 'asc' },
      });
      const currentIdx = thresholds.findIndex((t) => t.tierName === deal.tier);
      nextThresh = thresholds[currentIdx + 1] ?? null;
      amountToUpgrade = nextThresh ? Math.max(0, Number(nextThresh.minPrice) - grandTotal) : null;
    }

    const invoiceNumber = await nextInvoiceNumber();

    const invoice = await prisma.sponsorInvoice.create({
      data: {
        invoiceNumber,
        promotorId,
        eventId,
        dealId: deal ? deal.id : null,
        sponsorName: deal ? deal.sponsorName : (bodySponsorName?.trim() || '—'),
        sponsorEmail: deal ? deal.email : (bodySponsorEmail?.trim() || ''),
        contactName: deal ? (deal.contactName || deal.sponsorName) : (bodyContactName?.trim() || '—'),
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
        invoiceType: invoiceType ?? (deal ? 'sponsorship' : 'manual'),
        bonusItems: Array.isArray(bonusItems) ? bonusItems : [],
        currentTier: deal ? deal.tier : '-',
        nextTier: nextThresh?.tierName ?? null,
        amountToUpgrade: amountToUpgrade && amountToUpgrade > 0 ? amountToUpgrade : null,
        status: 'Belum Dibayar',
      },
    });

    const filename = `${invoice.id}.pdf`;
    const outputPath = path.join(invoicesDir(), filename);
    await buildPdf(invoice, outputPath);

    const pdfUrl = `/public/invoices/${filename}`;
    await prisma.sponsorInvoice.update({ where: { id: invoice.id }, data: { pdfUrl } });

    return res.json({ success: true, data: { ...invoice, pdfUrl }, message: 'Invoice berhasil dibuat.' });
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
    // Cek kepemilikan dulu — cegah IDOR ubah status invoice promotor lain.
    const existing = await prisma.sponsorInvoice.findUnique({
      where: { id: req.params.id },
      select: { promotorId: true },
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Invoice tidak ditemukan.' });
    if (existing.promotorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke invoice ini.' });
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
    if (invoice.promotorId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke invoice ini.' });
    }
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
