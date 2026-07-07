const prisma = require('../src/lib/prisma');
const QRCode = require('qrcode');
const { sendOrderEmail } = require('../services/email.service');
const { generateTicketsForOrderItems, countTicketsForNik, MAX_TICKETS_PER_NIK, computeFeeAndTax, resolveFeePercents } = require('../services/ticket.service');

const PAYMENT_METHODS = ['cash', 'transfer'];

// Keputusan desain: URL box office memakai eventId langsung (/box-office/:eventId), bukan token khusus.
// Alasan: route publik memang di-key by eventId (sesuai spec), dan halaman hanya expose jenis tiket
// (info publik, sama dengan storefront). Kontrol keamanan v1 = penguasaan fisik QR oleh panitia di lokasi.
// Catatan: order box office dibuat langsung "paid" & mengurangi stok permanen — hardening ke depan bisa
// tambah token per-event tak-tertebak untuk cegah pembuatan order palsu oleh yang tahu eventId.

// POST /api/tickets/box-office/generate-qr — protected (promotor pemilik event)
const generateBoxOfficeQR = async (req, res) => {
  try {
    const { eventId } = req.body;
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const baseUrl = process.env.CLIENT_URL || 'https://nexeventapp.tech';
    const url = `${baseUrl}/box-office/${event.id}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 400 });

    return res.json({ success: true, url, qrDataUrl, eventId: event.id });
  } catch (err) {
    console.error('[BOX OFFICE GENERATE QR ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/box-office/:eventId — PUBLIC: info event ringkas + jenis tiket aktif
const getBoxOfficeEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { ticketTypes: { where: { isActive: true }, orderBy: { price: 'asc' } } },
    });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const ticketTypes = event.ticketTypes.map((tt) => ({
      id: tt.id,
      name: tt.name,
      description: tt.description,
      price: tt.price,
      available: tt.quota - tt.sold,
      isSoldOut: tt.sold >= tt.quota,
    }));

    // Fee & pajak: box office pakai setting event yang SAMA dengan online storefront
    // (satu setting per event). feeBearer + taxEnabled + fee % (tiket) dikirim ke frontend
    // supaya rincian harga bisa ditampilkan SEBELUM pembeli pilih metode bayar.
    // Box office ticket-only → yang relevan cuma ticketFeePercent (fallback chain via resolveFeePercents).
    const { ticketFeePercent } = resolveFeePercents(event);

    return res.json({
      success: true,
      event: {
        id: event.id,
        title: event.title,
        location: event.location,
        event_date: event.event_date,
        bannerUrl: event.bannerUrl,
        logoUrl: event.logoUrl,
        feeBearer: event.feeBearer,
        taxEnabled: event.taxEnabled,
        ticketFeePercent,
      },
      ticketTypes,
    });
  } catch (err) {
    console.error('[BOX OFFICE GET EVENT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/box-office/:eventId/order — PUBLIC: buat order box office (langsung paid, cash/transfer)
const createBoxOfficeOrder = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { buyerName, buyerEmail, buyerNik, paymentMethod } = req.body;
    const ticketItems = Array.isArray(req.body.ticketItems) ? req.body.ticketItems : [];

    if (!buyerName || !buyerName.trim()) {
      return res.status(400).json({ success: false, message: 'Nama pembeli wajib diisi.' });
    }
    // paymentMethod WAJIB (tanpa default) — jadi dasar hutang fee (item roadmap #4).
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Metode pembayaran wajib dipilih: cash atau transfer.' });
    }
    if (ticketItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Pilih minimal 1 tiket.' });
    }
    // NIK wajib + valid (anti-calo).
    if (!/^\d{16}$/.test(buyerNik || '')) {
      return res.status(400).json({ success: false, message: 'NIK harus 16 digit angka.' });
    }
    // Email WAJIB (e-ticket & konfirmasi dikirim ke sini). Cek kosong dulu, lalu format — pola sama dgn storefront.
    if (!buyerEmail || !buyerEmail.trim()) {
      return res.status(400).json({ success: false, message: 'Email wajib diisi untuk pengiriman e-ticket & konfirmasi.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
      return res.status(400).json({ success: false, message: 'Format email tidak valid.' });
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    // Anti-calo NIK: kumulatif lintas SEMUA channel (online + box_office).
    const newCount = ticketItems.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
    if (newCount <= 0) {
      return res.status(400).json({ success: false, message: 'Jumlah tiket tidak valid.' });
    }
    const existingCount = await countTicketsForNik(prisma, event.id, buyerNik);
    if (existingCount + newCount > MAX_TICKETS_PER_NIK) {
      return res.status(400).json({
        success: false,
        message: `NIK ini sudah memiliki ${existingCount} tiket. Maksimal ${MAX_TICKETS_PER_NIK} tiket per NIK per event.`,
      });
    }

    let created;
    try {
      created = await prisma.$transaction(async (tx) => {
        let subtotal = 0;
        const createItems = [];
        for (const item of ticketItems) {
          const tt = await tx.ticketType.findUnique({ where: { id: item.ticketTypeId } });
          if (!tt || tt.eventId !== event.id || !tt.isActive) {
            throw new Error('Jenis tiket tidak tersedia.');
          }
          const qty = Number(item.quantity);
          if (qty <= 0) throw new Error('Jumlah tiket tidak valid.');
          if (tt.sold + qty > tt.quota) {
            throw new Error(`Tiket ${tt.name} tidak tersedia dalam jumlah yang diminta.`);
          }
          await tx.ticketType.update({ where: { id: tt.id }, data: { sold: { increment: qty } } });
          subtotal += tt.price * qty;
          createItems.push({ ticketTypeId: tt.id, quantity: qty, price: tt.price });
        }

        // Fee & pajak dihitung dengan helper bersama yang sama persis dengan online checkout.
        // Box office HANYA menjual TicketType (tanpa merch/bundle) → cukup kirim ticketSubtotal.
        const { feeAmount, taxAmount } = computeFeeAndTax(event, { ticketSubtotal: subtotal });

        // Box office mengikuti setting feeBearer event yang SAMA dengan online storefront — satu setting per
        // event yang sudah dipilih promotor & disetujui admin (event.feeBearer). Tidak ada setting fee khusus
        // box office; hanya UI & metode bayar yang beda, aturan fee identik dengan createOrder di
        // storefront.controller.js. Branching dibuat sama persis supaya konsisten (jangan bikin formula baru).
        const feeBearer = event.feeBearer === 'audience' ? 'audience' : 'promotor';
        // Fee & pajak = DUA aturan TERPISAH (sama persis dgn storefront.controller.js createOrder — jangan digabung):
        //   - Platform FEE ditambahkan ke tagihan HANYA kalau feeBearer 'audience'. Kalau 'promotor', fee
        //     diserap promotor (tidak ditagih ke pembeli).
        //   - PAJAK 10% SELALU ditagih ke pembeli kalau event.taxEnabled — TIDAK tergantung feeBearer sama sekali.
        // feeAmount & taxAmount TETAP dipersist ke order apa pun kasusnya (untuk P&L + rekonsiliasi hutang fee #4).
        // Pakai angka mentah computeFeeAndTax, TANPA pembulatan tambahan.
        const totalAmount = subtotal + (feeBearer === 'audience' ? feeAmount : 0) + (event.taxEnabled ? taxAmount : 0);

        const orderId = `nexevent-boxoffice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const order = await tx.ticketOrder.create({
          data: {
            eventId: event.id,
            orderId,
            orderType: 'ticket',
            channel: 'box_office',
            paymentMethod,
            buyerName: buyerName.trim(),
            buyerEmail: buyerEmail || '',
            buyerPhone: '',
            buyerNik,
            totalAmount,
            feeAmount,
            feeBearer,
            taxAmount,
            status: 'paid',
            paidAt: new Date(),
            // expiredAt non-null di schema; order box office langsung paid jadi tidak dipakai untuk release.
            expiredAt: new Date(),
            items: { create: createItems },
          },
          include: { items: true },
        });

        // Generate e-ticket langsung (pembayaran sudah dikonfirmasi panitia di lokasi).
        await generateTicketsForOrderItems(tx, order.items);
        return order;
      });
    } catch (txErr) {
      return res.status(400).json({ success: false, message: txErr.message || 'Gagal membuat pesanan.' });
    }

    // Ambil tiket + QR data URL supaya bisa langsung ditampilkan di layar pembeli (untuk di-screenshot).
    // NOTE: TicketOrderItem.orderId = FK ke TicketOrder.id (UUID), BUKAN string order_id — pakai created.id.
    const tickets = await prisma.ticket.findMany({
      where: { orderItem: { orderId: created.id } },
      include: { orderItem: { include: { ticketType: { select: { name: true } } } } },
    });
    const ticketsWithQr = await Promise.all(
      tickets.map(async (t) => ({
        id: t.id,
        ticketCode: t.ticketCode,
        typeName: t.orderItem?.ticketType?.name || 'Tiket',
        qrDataUrl: await QRCode.toDataURL(t.ticketCode, { width: 240 }),
      }))
    );

    // Email pembeli WAJIB → selalu kirim e-ticket. QR tetap ditampilkan di layar sebagai fallback.
    // Kegagalan email tidak membatalkan order (tiket sudah tercatat & tampil di layar).
    try {
      const fullOrder = await prisma.ticketOrder.findUnique({
        where: { orderId: created.orderId },
        include: {
          event: true,
          items: { include: { ticketType: true } },
          merchItems: true,
          bundleItems: true,
        },
      });
      await sendOrderEmail(fullOrder);
    } catch (mailErr) {
      console.error('[BOX OFFICE EMAIL ERROR]', mailErr.message);
    }

    return res.status(201).json({
      success: true,
      orderId: created.orderId,
      paymentMethod: created.paymentMethod,
      buyerName: created.buyerName,
      totalAmount: created.totalAmount,
      tickets: ticketsWithQr,
    });
  } catch (err) {
    console.error('[BOX OFFICE CREATE ORDER ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { generateBoxOfficeQR, getBoxOfficeEvent, createBoxOfficeOrder };
