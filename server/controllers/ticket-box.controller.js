const crypto = require('crypto');
const prisma = require('../src/lib/prisma');
const QRCode = require('qrcode');
const { snap } = require('../services/midtrans.service');
const { sendOrderEmail } = require('../services/email.service');
const { generateTicketsForOrderItems, countTicketsForNik, MAX_TICKETS_PER_NIK, computeOrderFeeAndTax, requireCategoryFee, isSellable } = require('../services/ticket.service');
const { parseNik } = require('../services/nik-parser.service');

const PAYMENT_METHODS = ['cash', 'transfer'];
const BOOKING_MINUTES = 15; // sama dengan online storefront — window bayar transfer sebelum di-release cron.

// ═══ Keamanan Ticket Box (hardening 2026-07-24 — menutup celah terbuka sejak 2026-07-06) ═══
// Model v1 lama ("kontrol keamanan = penguasaan fisik QR") TIDAK cukup: eventId BUKAN rahasia
// (muncul di URL storefront publik), dan order CASH langsung "paid" + mengurangi stok permanen +
// tercatat sebagai hutang fee promotor (DEBT_ORDER_WHERE di fee-debt.service.js). Siapa pun yang tahu
// eventId bisa membanjiri event dengan order cash palsu.
// Model sekarang: `Event.boxOfficeToken` — string crypto-random per-event, TIDAK diturunkan dari data
// apa pun yang bisa ditebak. Digenerate lazy saat promotor generate QR; ter-embed di URL dalam QR
// (`/ticket-box/:eventId?token=…`) sehingga alur lapangan TIDAK berubah: pembeli scan QR → token ikut.
// KEDUA endpoint publik (GET event + POST order) menolak 403 tanpa token yang cocok, dan FAIL-CLOSED
// kalau event belum punya token (QR belum pernah digenerate = belum ada kanal jualan yang sah).
// eventId TETAP di path (routing/lookup) — token adalah kredensial TAMBAHAN, bukan pengganti.
// Rotasi: generate-qr dgn `rotate:true` menerbitkan token baru → QR/link lama langsung mati.

/** Bandingkan token kiriman vs tersimpan secara constant-time; fail-closed kalau belum ada token. */
function isValidBoxToken(event, provided) {
  if (!event.boxOfficeToken || typeof provided !== 'string' || provided.length === 0) return false;
  // Hash dulu supaya panjang buffer selalu sama (syarat timingSafeEqual) tanpa membocorkan panjang token.
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(event.boxOfficeToken).digest();
  return crypto.timingSafeEqual(a, b);
}

const BOX_TOKEN_REJECT_MESSAGE =
  'Link Ticket Box tidak valid atau sudah diganti. Minta panitia menampilkan QR terbaru.';

// POST /api/tickets/ticket-box/generate-qr — protected (promotor pemilik event)
// body: { eventId, rotate? } — rotate:true menerbitkan token BARU (mematikan QR/link lama seketika;
// dipakai kalau token dicurigai bocor). Tanpa rotate, token existing dipertahankan → QR stabil.
const generateTicketBoxQR = async (req, res) => {
  try {
    const { eventId, rotate } = req.body;
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    // Lazy-generate token saat pertama kali (event lama pra-fitur ikut kebagian di sini),
    // atau terbitkan baru saat rotasi. base64url 24 byte ≈ 32 char, aman & URL-safe.
    let token = event.boxOfficeToken;
    if (!token || rotate === true) {
      token = crypto.randomBytes(24).toString('base64url');
      await prisma.event.update({ where: { id: event.id }, data: { boxOfficeToken: token } });
    }

    const baseUrl = process.env.CLIENT_URL || 'https://nexeventapp.tech';
    const url = `${baseUrl}/ticket-box/${event.id}?token=${token}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 400 });

    return res.json({ success: true, url, qrDataUrl, eventId: event.id, rotated: Boolean(rotate) });
  } catch (err) {
    console.error('[TICKET BOX GENERATE QR ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/ticket-box/:eventId — PUBLIC: info event ringkas + jenis tiket aktif
const getTicketBoxEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { ticketTypes: { where: { isActive: true }, orderBy: { price: 'asc' } } },
    });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    // Guard token (lihat blok keamanan di atas): tanpa token yang cocok → 403, fail-closed.
    if (!isValidBoxToken(event, req.query.token)) {
      return res.status(403).json({ success: false, message: BOX_TOKEN_REJECT_MESSAGE });
    }

    // Gating fee per-kategori — sama dgn online storefront: jenis tiket yang fee-nya belum
    // ditetapkan admin TIDAK ditawarkan (checkout-nya pasti ditolak). feePercent ikut dikirim
    // supaya panitia bisa lihat rincian harga SEBELUM pembeli pilih metode bayar.
    const ticketTypes = event.ticketTypes.filter(isSellable).map((tt) => ({
      id: tt.id,
      name: tt.name,
      description: tt.description,
      price: tt.price,
      available: tt.quota - tt.sold,
      isSoldOut: tt.sold >= tt.quota,
      feePercent: tt.feePercent,
    }));

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
        // ticketFeePercent level-event DIHAPUS dari response — fee sekarang per jenis tiket
        // (ada di tiap entri ticketTypes di atas).
      },
      ticketTypes,
    });
  } catch (err) {
    console.error('[TICKET BOX GET EVENT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/ticket-box/:eventId/order — PUBLIC: buat order Ticket Box (cash=langsung paid, transfer=via Midtrans)
const createTicketBoxOrder = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { buyerName, buyerEmail, buyerNik, paymentMethod } = req.body;
    const ticketItems = Array.isArray(req.body.ticketItems) ? req.body.ticketItems : [];

    if (!buyerName || !buyerName.trim()) {
      return res.status(400).json({ success: false, message: 'Nama pembeli wajib diisi.' });
    }
    // paymentMethod WAJIB (tanpa default). cash → tunai ke promotor; transfer → WAJIB lewat Midtrans
    // (uang tidak pernah langsung ke rekening pribadi promotor untuk transfer).
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ success: false, message: 'Metode pembayaran wajib dipilih: cash atau transfer.' });
    }
    if (ticketItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Pilih minimal 1 tiket.' });
    }
    // NIK wajib + valid (anti-calo). Ticket Box selalu jual tiket (ticketItems.length dicek di atas).
    if (!/^\d{16}$/.test(buyerNik || '')) {
      return res.status(400).json({ success: false, message: 'NIK harus 16 digit angka.' });
    }
    // Tanggal lahir (digit 7-12) harus masuk akal — reuse parser Data Audiens.
    const parsedNik = parseNik(buyerNik);
    if (!parsedNik.valid) {
      return res.status(400).json({ success: false, message: `NIK tidak valid: ${parsedNik.reason}` });
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

    // Guard token — dicek SEBELUM menyentuh stok/order apa pun. Token dari body (dikirim halaman
    // Ticket Box yang membacanya dari ?token= di URL hasil scan QR) dgn fallback query param.
    if (!isValidBoxToken(event, req.body.boxToken ?? req.query.token)) {
      return res.status(403).json({ success: false, message: BOX_TOKEN_REJECT_MESSAGE });
    }

    // Anti-calo NIK: kumulatif lintas SEMUA channel (online + ticket_box). Order transfer "pending"
    // tetap menahan kuota NIK (countTicketsForNik hitung status pending & paid).
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

    const isTransfer = paymentMethod === 'transfer';

    let created;
    try {
      created = await prisma.$transaction(async (tx) => {
        let subtotal = 0;
        const createItems = [];
        const ticketLines = []; // { subtotal, feePercent } per jenis tiket — dasar hitung fee
        const itemDetails = []; // untuk Snap — hanya dipakai kalau transfer
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
          // Stok di-reserve untuk KEDUA metode. Kalau transfer tak dibayar, cron ticket-booking (15 menit)
          // mengembalikan stok — sama persis dengan online storefront.
          // Fail-closed: jenis tiket tanpa fee sah TIDAK bisa dijual — termasuk lewat Ticket Box.
          // Aturan identik dgn online storefront (jangan bikin pengecualian untuk penjualan offline).
          const ttFee = requireCategoryFee(tt, 'Jenis tiket');
          await tx.ticketType.update({ where: { id: tt.id }, data: { sold: { increment: qty } } });
          subtotal += tt.price * qty;
          ticketLines.push({ subtotal: tt.price * qty, feePercent: ttFee });
          createItems.push({ ticketTypeId: tt.id, quantity: qty, price: tt.price });
          itemDetails.push({ id: tt.id, price: tt.price, quantity: qty, name: `${tt.name}`.slice(0, 50) });
        }

        // Fee & pajak lewat helper bersama yang sama persis dengan online checkout — fee kini dari
        // fee% masing-masing jenis tiket. Ticket Box HANYA menjual TicketType (tanpa merch/bundle).
        const { feeAmount, taxAmount } = computeOrderFeeAndTax(event, { ticketLines });

        // Ticket Box mengikuti setting feeBearer event yang SAMA dengan online storefront — satu setting per
        // event yang sudah dipilih promotor & disetujui admin (event.feeBearer). Tidak ada setting fee khusus
        // Ticket Box; hanya UI & metode bayar yang beda, aturan fee identik dengan createOrder di
        // storefront.controller.js. Branching dibuat sama persis supaya konsisten (jangan bikin formula baru).
        const feeBearer = event.feeBearer === 'audience' ? 'audience' : 'promotor';
        // Fee & pajak = DUA aturan TERPISAH (sama persis dgn storefront.controller.js createOrder — jangan digabung):
        //   - Platform FEE ditambahkan ke tagihan HANYA kalau feeBearer 'audience'. Kalau 'promotor', fee
        //     diserap promotor (tidak ditagih ke pembeli).
        //   - PAJAK 10% SELALU ditagih ke pembeli kalau event.taxEnabled — TIDAK tergantung feeBearer sama sekali.
        // feeAmount & taxAmount TETAP dipersist ke order apa pun kasusnya (untuk P&L + rekonsiliasi hutang fee #4).
        // Pakai angka mentah computeOrderFeeAndTax, TANPA pembulatan tambahan.
        const totalAmount = subtotal + (feeBearer === 'audience' ? feeAmount : 0) + (event.taxEnabled ? taxAmount : 0);

        const orderId = `nexevent-ticketbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const order = await tx.ticketOrder.create({
          data: {
            eventId: event.id,
            orderId,
            orderType: 'ticket',
            channel: 'ticket_box',
            paymentMethod,
            buyerName: buyerName.trim(),
            buyerEmail: buyerEmail || '',
            buyerPhone: '',
            buyerNik,
            totalAmount,
            feeAmount,
            feeBearer,
            taxAmount,
            // CASH: langsung paid (uang diterima panitia di lokasi). TRANSFER: pending sampai settlement Midtrans.
            status: isTransfer ? 'pending' : 'paid',
            paidAt: isTransfer ? null : new Date(),
            // CASH: expiredAt tidak dipakai (langsung paid) → isi now. TRANSFER: now + 15 menit (window bayar,
            // di-release cron ticket-booking kalau tak dibayar — identik online storefront).
            expiredAt: isTransfer ? new Date(Date.now() + BOOKING_MINUTES * 60 * 1000) : new Date(),
            items: { create: createItems },
          },
          include: { items: true },
        });

        if (isTransfer) {
          // === Metode TRANSFER → WAJIB lewat Midtrans Snap ===
          // CATATAN: Midtrans masih SANDBOX (CLAUDE.md roadmap #10 "URGENT: Midtrans Production — awaiting KYC").
          // Flow ini bisa dibangun & dites penuh di sandbox sekarang, tapi TIDAK menerima pembayaran nyata
          // sampai kredensial production aktif.
          // Fee jadi baris terpisah kalau ditanggung penonton; pajak selalu jadi baris kalau ada — supaya
          // gross_amount == jumlah item_details (syarat Midtrans).
          if (feeBearer === 'audience' && feeAmount > 0) {
            // Persentase tidak dicantumkan: fee per-kategori, satu baris agregat tak bisa diwakili satu %.
            itemDetails.push({ id: 'fee-ticket', price: feeAmount, quantity: 1, name: 'Biaya Layanan Tiket' });
          }
          if (event.taxEnabled && taxAmount > 0) {
            itemDetails.push({ id: 'tax', price: taxAmount, quantity: 1, name: 'Pajak Tiket (10%)' });
          }
          const parameter = {
            transaction_details: { order_id: orderId, gross_amount: totalAmount },
            item_details: itemDetails,
            customer_details: { first_name: buyerName.trim(), email: buyerEmail },
          };
          const transaction = await snap.createTransaction(parameter);
          await tx.ticketOrder.update({ where: { id: order.id }, data: { midtransToken: transaction.token } });
          return { ...order, midtransToken: transaction.token };
        }

        // === Metode CASH → generate e-ticket langsung (pembayaran sudah dikonfirmasi panitia di lokasi) ===
        await generateTicketsForOrderItems(tx, order.items);
        return order;
      });
    } catch (txErr) {
      return res.status(400).json({ success: false, message: txErr.message || 'Gagal membuat pesanan.' });
    }

    // === TRANSFER: belum ada tiket (menunggu settlement webhook). Kembalikan token Snap + orderId. ===
    // Email & e-ticket dikirim otomatis oleh webhook (payment.controller.js handleTicketOrderWebhook) saat
    // status → paid, identik dengan online storefront. Frontend: window.snap.pay(token) → redirect /order/:orderId.
    if (isTransfer) {
      return res.status(201).json({
        success: true,
        orderId: created.orderId,
        token: created.midtransToken,
        expiredAt: created.expiredAt,
        paymentMethod: 'transfer',
      });
    }

    // === CASH: ambil tiket + QR data URL supaya bisa langsung ditampilkan di layar pembeli (untuk di-screenshot). ===
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
      console.error('[TICKET BOX EMAIL ERROR]', mailErr.message);
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
    console.error('[TICKET BOX CREATE ORDER ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { generateTicketBoxQR, getTicketBoxEvent, createTicketBoxOrder };
