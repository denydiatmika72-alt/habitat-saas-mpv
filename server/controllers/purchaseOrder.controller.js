const prisma = require('../src/lib/prisma');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const IDR = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
});

function purchaseOrdersDir() {
  const dir = path.join(__dirname, '..', 'public', 'purchase-orders');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function buildPOPdf(po, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const pageW = doc.page.width;
    const mL = 50, mR = 50;
    const cW = pageW - mL - mR;

    const tanggalTerbit = new Date(po.createdAt).toLocaleDateString('id-ID', {
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

    // ── SECTION 1: HEADER ──────────────────────────────────────────────────

    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(14)
       .text(po.event?.title ?? 'nexEvent', mL, y, { width: cW / 2, lineBreak: false });
    doc.fillColor('#64748b').font('Helvetica').fontSize(10)
       .text('Event Organizer', mL, y + 20, { width: cW / 2, lineBreak: false });

    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(14)
       .text('PURCHASE ORDER', mL, y, { width: cW, align: 'right', lineBreak: false });

    const nomorPO = `PO-${po.id.slice(0, 8).toUpperCase()}`;
    doc.fillColor('#64748b').font('Helvetica').fontSize(10)
       .text(nomorPO, mL, y + 20, { width: cW, align: 'right', lineBreak: false });

    y += 46;

    doc.moveTo(mL, y).lineTo(pageW - mR, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    y += 20;

    // ── SECTION 2: INFO DOKUMEN ────────────────────────────────────────────

    const halfW = Math.floor(cW / 2) - 10;
    const rightX = mL + Math.floor(cW / 2) + 10;

    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text('JUDUL PURCHASE ORDER', mL, y, { width: halfW, lineBreak: false });
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(12)
       .text(po.title, mL, y + 13, { width: halfW, lineBreak: false });
    if (po.notes) {
      doc.fillColor('#475569').font('Helvetica').fontSize(10)
         .text(po.notes, mL, y + 30, { width: halfW });
    }

    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text('INFORMASI DOKUMEN', rightX, y, { width: halfW, lineBreak: false });
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(10)
       .text(`Tanggal: ${tanggalTerbit}`, rightX, y + 13, { width: halfW, lineBreak: false });
    doc.fillColor('#475569').font('Helvetica').fontSize(10)
       .text(`Status: ${po.status.toUpperCase()}`, rightX, y + 30, { width: halfW, lineBreak: false });
    doc.fillColor('#475569').font('Helvetica').fontSize(10)
       .text(`Vendor: ${po.vendorId ?? '-'}`, rightX, y + 44, { width: halfW, lineBreak: false });

    y += 66;

    doc.moveTo(mL, y).lineTo(pageW - mR, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    y += 20;

    // ── SECTION 3: TABEL ITEM ──────────────────────────────────────────────

    const ROW_H  = 22;
    const HEAD_H = 26;

    doc.rect(mL, y, cW, HEAD_H).fill('#1a1a2e');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
       .text('#',            COL.no.x + 2, y + 9, { width: COL.no.w,    lineBreak: false });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
       .text('NAMA ITEM',    COL.item.x,   y + 9, { width: COL.item.w,  lineBreak: false });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
       .text('QTY',          COL.qty.x,    y + 9, { width: COL.qty.w,   align: 'right', lineBreak: false });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
       .text('HARGA SATUAN', COL.price.x,  y + 9, { width: COL.price.w, align: 'right', lineBreak: false });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
       .text('SUBTOTAL',     COL.sub.x,    y + 9, { width: COL.sub.w,   align: 'right', lineBreak: false });
    y += HEAD_H;

    const items = Array.isArray(po.items) ? po.items : [];
    items.forEach((item, idx) => {
      const bg = idx % 2 === 0 ? '#f1f5f9' : '#ffffff';
      doc.rect(mL, y, cW, ROW_H).fill(bg);
      doc.fillColor('#374151').font('Helvetica').fontSize(9)
         .text(String(idx + 1),                     COL.no.x + 2, y + 7, { width: COL.no.w,    lineBreak: false });
      doc.fillColor('#374151').font('Helvetica').fontSize(9)
         .text(item.name,                            COL.item.x,   y + 7, { width: COL.item.w,  lineBreak: false });
      doc.fillColor('#374151').font('Helvetica').fontSize(9)
         .text(String(item.qty),                     COL.qty.x,    y + 7, { width: COL.qty.w,   align: 'right', lineBreak: false });
      doc.fillColor('#374151').font('Helvetica').fontSize(9)
         .text(IDR.format(Number(item.unitPrice)),   COL.price.x,  y + 7, { width: COL.price.w, align: 'right', lineBreak: false });
      doc.fillColor('#374151').font('Helvetica').fontSize(9)
         .text(IDR.format(Number(item.totalPrice)),  COL.sub.x,    y + 7, { width: COL.sub.w,   align: 'right', lineBreak: false });
      y += ROW_H;
    });

    doc.moveTo(mL, y).lineTo(pageW - mR, y).strokeColor('#94a3b8').lineWidth(0.5).stroke();

    const TOTAL_H = 32;
    doc.rect(mL, y, cW, TOTAL_H).fill('#1a1a2e');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
       .text('TOTAL', COL.item.x, y + 11, {
         width: COL.item.w + COL.qty.w + COL.price.w + 5,
         lineBreak: false,
       });
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
       .text(IDR.format(Number(po.totalAmount)), COL.sub.x, y + 11, {
         width: COL.sub.w, align: 'right', lineBreak: false,
       });
    y += TOTAL_H + 28;

    // ── SECTION 4: TANDA TANGAN ────────────────────────────────────────────

    const ttW = (cW - 20) / 2;
    const ttRightX = mL + ttW + 20;

    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text('DIBUAT OLEH', mL, y, { width: ttW, align: 'center', lineBreak: false });
    y += 50;
    doc.moveTo(mL + 20, y).lineTo(mL + ttW - 20, y).strokeColor('#94a3b8').lineWidth(0.5).stroke();
    y += 8;
    doc.fillColor('#475569').font('Helvetica').fontSize(9)
       .text('Nama & Jabatan', mL, y, { width: ttW, align: 'center', lineBreak: false });

    const ttY = y - 58;
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text('DISETUJUI OLEH', ttRightX, ttY, { width: ttW, align: 'center', lineBreak: false });
    doc.moveTo(ttRightX + 20, ttY + 58).lineTo(ttRightX + ttW - 20, ttY + 58)
       .strokeColor('#94a3b8').lineWidth(0.5).stroke();
    doc.fillColor('#475569').font('Helvetica').fontSize(9)
       .text('Nama & Jabatan', ttRightX, ttY + 66, { width: ttW, align: 'center', lineBreak: false });

    y += 24;

    // ── SECTION 5: FOOTER ──────────────────────────────────────────────────

    y += 20;
    doc.moveTo(mL, y).lineTo(pageW - mR, y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    y += 14;
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text('Dokumen ini dibuat secara otomatis oleh sistem nexEvent', mL, y, {
         width: cW, align: 'center', lineBreak: false,
       });
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
       .text(`Diterbitkan pada ${tanggalTerbit}`, mL, y + 12, {
         width: cW, align: 'center', lineBreak: false,
       });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// ─── POST /api/po ─────────────────────────────────────────────────────────────
const createPO = async (req, res) => {
  try {
    const { eventId, title, notes, items, vendorId } = req.body;

    if (!eventId || !title?.trim()) {
      return res.status(400).json({ success: false, message: 'eventId dan title wajib diisi.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'PO harus memiliki minimal 1 item.' });
    }

    // Cek kepemilikan event dulu — cegah membuat PO menempel di event promotor lain (IDOR sisi tulis).
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { promotor_id: true },
    });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    }
    if (event.promotor_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke event ini.' });
    }

    for (const item of items) {
      if (!item.name?.trim()) {
        return res.status(400).json({ success: false, message: 'Nama item tidak boleh kosong.' });
      }
      if (Number(item.qty) <= 0 || Number(item.unitPrice) <= 0) {
        return res.status(400).json({ success: false, message: 'Qty dan Harga Satuan harus lebih dari 0.' });
      }
    }

    // Hitung total di sisi backend — jangan percaya angka dari client
    const computedItems = items.map((item) => ({
      name: item.name.trim(),
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.qty) * Number(item.unitPrice),
      sourceRabItemId: item.sourceRabItemId ?? null,
    }));
    const totalAmount = computedItems.reduce((sum, i) => sum + i.totalPrice, 0);

    const po = await prisma.purchaseOrder.create({
      data: {
        eventId,
        vendorId: vendorId ?? null,
        title: title.trim(),
        notes: notes?.trim() ?? null,
        totalAmount,
        items: { create: computedItems },
      },
      include: { items: true },
    });

    return res.status(201).json({ success: true, data: po, message: 'Purchase Order berhasil dibuat.' });
  } catch (err) {
    console.error('[createPO]', err);
    return res.status(500).json({ success: false, message: 'Gagal membuat Purchase Order.' });
  }
};

// ─── GET /api/po?eventId=xxx  (tanpa eventId → semua PO milik user) ──────────
const getPOsByEvent = async (req, res) => {
  try {
    const { eventId } = req.query;

    // Kalau eventId diberikan langsung, cek kepemilikan event dulu — cegah IDOR baca PO event promotor lain.
    // Tanpa eventId, filter by event.promotor_id sudah membatasi ke milik sendiri (aman).
    if (eventId) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { promotor_id: true },
      });
      if (!event) {
        return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
      }
      if (event.promotor_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke event ini.' });
      }
    }

    const where = eventId
      ? { eventId }
      : { event: { promotor_id: req.user.id } };

    const pos = await prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        event: { select: { id: true, title: true } },
      },
    });

    return res.json({ success: true, data: pos });
  } catch (err) {
    console.error('[getPOsByEvent]', err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil data PO.' });
  }
};

// ─── GET /api/po/:id ──────────────────────────────────────────────────────────
const getPOById = async (req, res) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!po) return res.status(404).json({ success: false, message: 'PO tidak ditemukan.' });
    return res.json({ success: true, data: po });
  } catch (err) {
    console.error('[getPOById]', err);
    return res.status(500).json({ success: false, message: 'Gagal mengambil PO.' });
  }
};

// ─── PUT /api/po/:id ──────────────────────────────────────────────────────────
const updatePO = async (req, res) => {
  try {
    const { title, notes, status } = req.body;
    const VALID_STATUS = ['draft', 'sent', 'paid'];

    if (status && !VALID_STATUS.includes(status)) {
      return res.status(400).json({ success: false, message: `Status tidak valid. Gunakan: ${VALID_STATUS.join(', ')}` });
    }

    const data = {};
    if (title !== undefined) data.title = title.trim();
    if (notes !== undefined) data.notes = notes?.trim() ?? null;
    if (status !== undefined) data.status = status;

    const updated = await prisma.purchaseOrder.update({
      where: { id: req.params.id },
      data,
      include: { items: true },
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'PO tidak ditemukan.' });
    console.error('[updatePO]', err);
    return res.status(500).json({ success: false, message: 'Gagal update PO.' });
  }
};

// ─── DELETE /api/po/:id ───────────────────────────────────────────────────────
const deletePO = async (req, res) => {
  try {
    await prisma.purchaseOrder.delete({ where: { id: req.params.id } });
    return res.json({ success: true, message: 'PO berhasil dihapus.' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'PO tidak ditemukan.' });
    console.error('[deletePO]', err);
    return res.status(500).json({ success: false, message: 'Gagal menghapus PO.' });
  }
};

// ─── POST /api/po/:id/items ───────────────────────────────────────────────────
const addPOItem = async (req, res) => {
  try {
    const { name, qty, unitPrice, sourceRabItemId } = req.body;

    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Nama item wajib diisi.' });
    if (Number(qty) <= 0 || Number(unitPrice) <= 0) {
      return res.status(400).json({ success: false, message: 'Qty dan Harga Satuan harus lebih dari 0.' });
    }

    const q = Number(qty);
    const p = Number(unitPrice);
    const totalPrice = q * p;

    const item = await prisma.purchaseOrderItem.create({
      data: {
        purchaseOrderId: req.params.id,
        name: name.trim(),
        qty: q,
        unitPrice: p,
        totalPrice,
        sourceRabItemId: sourceRabItemId ?? null,
      },
    });

    // Recalculate totalAmount di PO
    const allItems = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: req.params.id } });
    const newTotal = allItems.reduce((sum, i) => sum + i.totalPrice, 0);
    await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: { totalAmount: newTotal } });

    return res.status(201).json({ success: true, data: item });
  } catch (err) {
    console.error('[addPOItem]', err);
    return res.status(500).json({ success: false, message: 'Gagal menambah item.' });
  }
};

// ─── DELETE /api/po/:id/items/:itemId ────────────────────────────────────────
const deletePOItem = async (req, res) => {
  try {
    await prisma.purchaseOrderItem.delete({ where: { id: req.params.itemId } });

    // Recalculate totalAmount di PO
    const allItems = await prisma.purchaseOrderItem.findMany({ where: { purchaseOrderId: req.params.id } });
    const newTotal = allItems.reduce((sum, i) => sum + i.totalPrice, 0);
    await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: { totalAmount: newTotal } });

    return res.json({ success: true, message: 'Item berhasil dihapus.' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Item tidak ditemukan.' });
    console.error('[deletePOItem]', err);
    return res.status(500).json({ success: false, message: 'Gagal menghapus item.' });
  }
};

// ─── GET /api/po/:id/pdf ──────────────────────────────────────────────────────
const generatePurchaseOrderPdf = async (req, res) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: {
        items: true,
        event: { select: { title: true, event_date: true } },
      },
    });
    if (!po) return res.status(404).json({ success: false, message: 'PO tidak ditemukan.' });

    // Simpan ke file dulu — JANGAN pipe langsung ke res
    const filename = `${po.id}.pdf`;
    const outputPath = path.join(purchaseOrdersDir(), filename);
    await buildPOPdf(po, outputPath);

    // Baru kirim file ke client setelah file selesai ditulis
    const safeTitle = po.title.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PO-${safeTitle}.pdf"`);

    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);

    // Hapus file sementara setelah selesai dikirim
    fileStream.on('end', () => {
      fs.unlink(outputPath, () => {});
    });
    fileStream.on('error', (err) => {
      console.error('[generatePurchaseOrderPdf] stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Gagal mengirim PDF.' });
      }
    });
  } catch (err) {
    console.error('[generatePurchaseOrderPdf]', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Gagal generate PDF PO.' });
    }
  }
};

module.exports = { createPO, getPOsByEvent, getPOById, updatePO, deletePO, addPOItem, deletePOItem, generatePurchaseOrderPdf };
