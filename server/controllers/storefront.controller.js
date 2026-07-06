const prisma = require('../src/lib/prisma');
const { snap } = require('../services/midtrans.service');
const { countTicketsForNik, MAX_TICKETS_PER_NIK, computeFeeAndTax, DEFAULT_FEE_PERCENT } = require('../services/ticket.service');

const BOOKING_MINUTES = 15;

// GET /api/storefront/:slug — PUBLIC
const getEventStorefront = async (req, res) => {
  try {
    const { slug } = req.params;

    const event = await prisma.event.findUnique({
      where: { slug },
      include: {
        ticketTypes: {
          where: { isActive: true },
          orderBy: { price: 'asc' },
        },
        merchItems: {
          where: { isActive: true, approvalStatus: 'approved' },
          include: { variants: { orderBy: { size: 'asc' } } },
          orderBy: { createdAt: 'asc' },
        },
        bundlePackages: {
          where: { isActive: true, approvalStatus: 'approved' },
          include: { items: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!event || event.storefrontStatus !== 'approved') {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    }

    const now = new Date();
    if (event.saleStartAt && now < event.saleStartAt) {
      return res.json({ success: true, event, status: 'not_started', message: 'Penjualan tiket belum dimulai.' });
    }
    if (event.saleEndAt && now > event.saleEndAt) {
      return res.json({ success: true, event, status: 'ended', message: 'Penjualan tiket telah berakhir.' });
    }

    const ticketTypesWithAvailability = event.ticketTypes.map((tt) => ({
      ...tt,
      available: tt.quota - tt.sold,
      isSoldOut: tt.sold >= tt.quota,
    }));

    const merchWithAvailability = event.merchItems.map((item) => ({
      ...item,
      variants: item.variants.map((v) => ({
        ...v,
        available: v.stock - v.sold,
        isSoldOut: v.sold >= v.stock,
      })),
    }));

    // Bundle: BundleItem tidak punya relasi FK, jadi resolve nama + stok dari data event.
    // Availability dihitung terhadap SEMUA tiket/varian event (bukan cuma yang aktif) supaya
    // paket tetap valid meski salah satu item-nya dinonaktifkan promotor di luar paket.
    const allTicketTypes = await prisma.ticketType.findMany({ where: { eventId: event.id } });
    const allMerchItems = await prisma.merchItem.findMany({
      where: { eventId: event.id },
      include: { variants: true },
    });

    const bundlePackages = event.bundlePackages.map((b) => {
      const items = b.items.map((it) => {
        if (it.itemType === 'ticket') {
          const tt = allTicketTypes.find((t) => t.id === it.ticketTypeId);
          return {
            ...it,
            label: tt ? tt.name : 'Tiket',
            unitPrice: tt ? tt.price : 0,
            unitAvailable: tt ? tt.quota - tt.sold : 0,
          };
        }
        // Merch di paket = PRODUK. Kembalikan varian yang masih ada stok supaya pembeli pilih size saat checkout.
        const mi = allMerchItems.find((m) => m.id === it.merchItemId);
        const variants = mi
          ? mi.variants
              .map((v) => ({ id: v.id, size: v.size, available: v.stock - v.sold }))
              .filter((v) => v.available > 0)
          : [];
        // unitAvailable = stok size terbanyak (buyer hanya bisa pilih 1 size untuk item merch ini).
        const unitAvailable = variants.reduce((max, v) => Math.max(max, v.available), 0);
        return {
          ...it,
          label: mi ? mi.name : 'Merchandise',
          unitPrice: mi ? mi.price : 0,
          variants,
          unitAvailable,
        };
      });
      // Paket tersedia hanya kalau SEMUA item punya stok cukup untuk minimal 1 paket
      // (untuk merch: minimal ada satu size dengan stok >= quantity item tsb).
      const isAvailable = items.every((it) => it.unitAvailable >= it.quantity);
      return { ...b, items, isAvailable };
    });

    return res.json({
      success: true,
      event: {
        ...event,
        ticketTypes: ticketTypesWithAvailability,
        merchItems: merchWithAvailability,
        bundlePackages,
        // feePercent legacy (fallback umum); fee per tipe order di-resolve frontend/backend
        // via chain: fee spesifik → platformFeePercent → 3.5. Field ticketFeePercent /
        // merchFeePercent / bundlingFeePercent sudah ikut ter-spread dari ...event.
        feePercent: event.platformFeePercent || DEFAULT_FEE_PERCENT,
        feeBearer: event.feeBearer,
        taxEnabled: event.taxEnabled,
      },
      status: 'active',
    });
  } catch (err) {
    console.error('[GET STOREFRONT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/storefront/:slug/order — PUBLIC (tiket, merch, atau bundling)
const createOrder = async (req, res) => {
  try {
    const { slug } = req.params;
    const { buyerName, buyerEmail, buyerPhone, buyerNik, items } = req.body;

    // ticketItems (nama baru) fallback ke items (nama lama) supaya backward-compatible.
    const ticketItems = Array.isArray(req.body.ticketItems)
      ? req.body.ticketItems
      : Array.isArray(items)
        ? items
        : [];
    const merchItems = Array.isArray(req.body.merchItems) ? req.body.merchItems : [];
    const bundleItems = Array.isArray(req.body.bundleItems) ? req.body.bundleItems : [];

    if (!buyerName || !buyerName.trim() || !buyerPhone || !buyerPhone.trim()) {
      return res.status(400).json({ success: false, message: 'Nama dan nomor HP wajib diisi.' });
    }
    // Email WAJIB untuk SEMUA tipe order (tiket/merch/bundling/mixed) — e-ticket & konfirmasi dikirim ke sini.
    if (!buyerEmail || !buyerEmail.trim()) {
      return res.status(400).json({ success: false, message: 'Email wajib diisi untuk pengiriman e-ticket & konfirmasi.' });
    }
    if (ticketItems.length === 0 && merchItems.length === 0 && bundleItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Pilih minimal 1 tiket, merchandise, atau paket.' });
    }
    if (!/^(\+62|62|0)8[0-9]{7,12}$/.test(buyerPhone.replace(/[\s-]/g, ''))) {
      return res.status(400).json({ success: false, message: 'Nomor HP tidak valid.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
      return res.status(400).json({ success: false, message: 'Format email tidak valid.' });
    }

    const event = await prisma.event.findUnique({ where: { slug } });
    if (!event || event.storefrontStatus !== 'approved') {
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    }

    const now = new Date();
    if (event.saleStartAt && now < event.saleStartAt) {
      return res.status(400).json({ success: false, message: 'Penjualan belum dimulai.' });
    }
    if (event.saleEndAt && now > event.saleEndAt) {
      return res.status(400).json({ success: false, message: 'Penjualan telah berakhir.' });
    }

    // Validasi paket bundling (server-side, tidak percaya harga/isi dari client).
    const bundleIds = bundleItems.map((b) => b.bundleId);
    const bundles = bundleIds.length
      ? await prisma.bundlePackage.findMany({
          where: { id: { in: bundleIds }, eventId: event.id, isActive: true, approvalStatus: 'approved' },
          include: { items: true },
        })
      : [];
    for (const bi of bundleItems) {
      const b = bundles.find((x) => x.id === bi.bundleId);
      if (!b) return res.status(400).json({ success: false, message: 'Paket bundling tidak tersedia.' });
      if (Number(bi.quantity) <= 0) return res.status(400).json({ success: false, message: 'Jumlah paket tidak valid.' });
    }

    // Berapa tiket yang terkandung di paket yang dibeli (untuk NIK limit anti-calo).
    const bundleTicketCount = bundleItems.reduce((sum, bi) => {
      const b = bundles.find((x) => x.id === bi.bundleId);
      const ticketsInBundle = b.items
        .filter((it) => it.itemType === 'ticket')
        .reduce((s, it) => s + it.quantity, 0);
      return sum + ticketsInBundle * Number(bi.quantity);
    }, 0);

    // Ada tiket kalau beli tiket langsung ATAU beli paket yang mengandung tiket.
    const hasTickets = ticketItems.length > 0 || bundleTicketCount > 0;

    // NIK wajib & harus valid kalau ada pembelian tiket (anti-calo). Untuk merch-only, NIK opsional.
    if (hasTickets) {
      if (!/^\d{16}$/.test(buyerNik || '')) {
        return res.status(400).json({ success: false, message: 'NIK harus 16 digit angka.' });
      }
    } else if (buyerNik && !/^\d{16}$/.test(buyerNik)) {
      return res.status(400).json({ success: false, message: 'NIK harus 16 digit angka.' });
    }
    const safeNik = buyerNik || '';

    // Anti-calo: limit NIK berlaku untuk tiket langsung DAN tiket di dalam paket, kumulatif lintas
    // channel (online + box_office) — pakai helper bersama (services/ticket.service.js).
    if (hasTickets) {
      const existingCount = await countTicketsForNik(prisma, event.id, safeNik);
      const newTicketCount = ticketItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const newCount = newTicketCount + bundleTicketCount;
      if (newCount <= 0) {
        return res.status(400).json({ success: false, message: 'Jumlah tiket tidak valid.' });
      }
      if (existingCount + newCount > MAX_TICKETS_PER_NIK) {
        return res.status(400).json({
          success: false,
          message: `NIK ini sudah memiliki ${existingCount} tiket. Maksimal ${MAX_TICKETS_PER_NIK} tiket per NIK per event.`,
        });
      }
    }

    const ticketTypes = ticketItems.length > 0
      ? await prisma.ticketType.findMany({ where: { eventId: event.id, id: { in: ticketItems.map((i) => i.ticketTypeId) } } })
      : [];

    // orderType hanya LABEL. "bundling" = ada paket kurasi; "mixed" = tiket + merch terpisah
    // (BUKAN bundling — fee tiket & merch dihitung sendiri-sendiri, lihat kalkulasi fee di bawah).
    let orderType;
    if (bundleItems.length > 0) orderType = 'bundling';
    else if (ticketItems.length > 0 && merchItems.length > 0) orderType = 'mixed';
    else if (ticketItems.length > 0) orderType = 'ticket';
    else orderType = 'merch';

    let order;
    try {
      order = await prisma.$transaction(async (tx) => {
        const itemDetails = [];
        // Subtotal dipisah: pajak 10% HANYA kena subtotal tiket, merch TIDAK pernah kena pajak.
        let ticketSubtotal = 0;
        let merchSubtotal = 0;

        // ===== Tiket =====
        for (const item of ticketItems) {
          const ticketType = await tx.ticketType.findUnique({ where: { id: item.ticketTypeId } });
          if (!ticketType || ticketType.eventId !== event.id || !ticketType.isActive) {
            throw new Error('Jenis tiket tidak tersedia.');
          }
          if (ticketType.sold + Number(item.quantity) > ticketType.quota) {
            throw new Error(`Tiket ${ticketType.name} tidak tersedia dalam jumlah yang diminta.`);
          }
          await tx.ticketType.update({
            where: { id: item.ticketTypeId },
            data: { sold: { increment: Number(item.quantity) } },
          });
          ticketSubtotal += ticketType.price * Number(item.quantity);
          itemDetails.push({
            id: item.ticketTypeId,
            price: ticketType.price,
            quantity: Number(item.quantity),
            name: `Tiket ${ticketType.name} — ${event.title}`.slice(0, 50),
          });
        }

        // ===== Merchandise =====
        const merchCreate = [];
        for (const m of merchItems) {
          const variant = await tx.merchVariant.findUnique({ where: { id: m.variantId }, include: { item: true } });
          if (!variant || variant.item.eventId !== event.id || !variant.item.isActive || variant.item.approvalStatus !== 'approved') {
            throw new Error('Varian merchandise tidak tersedia.');
          }
          if (variant.sold + Number(m.quantity) > variant.stock) {
            throw new Error(`Stok ${variant.item.name} (${variant.size}) tidak cukup.`);
          }
          await tx.merchVariant.update({
            where: { id: variant.id },
            data: { sold: { increment: Number(m.quantity) } },
          });
          merchSubtotal += variant.item.price * Number(m.quantity);
          merchCreate.push({
            merchItemId: variant.item.id,
            variantId: variant.id,
            quantity: Number(m.quantity),
            price: variant.item.price,
          });
          itemDetails.push({
            id: variant.id,
            price: variant.item.price,
            quantity: Number(m.quantity),
            name: `${variant.item.name} (${variant.size})`.slice(0, 50),
          });
        }

        // ===== Paket Bundling (kurasi) =====
        const bundleCreate = [];
        let bundleSubtotal = 0;
        // Nilai tiket di dalam paket (pakai harga face tiket) — dasar pajak, sesuai aturan
        // "pajak hanya dari porsi tiket". Bundle price dari promotor tidak diitemisasi, jadi
        // porsi tiket diambil dari harga tiket aslinya (didokumentasikan sebagai simplifikasi MVP).
        let bundleTicketValue = 0;
        for (const bi of bundleItems) {
          const bundle = await tx.bundlePackage.findUnique({ where: { id: bi.bundleId }, include: { items: true } });
          if (!bundle || bundle.eventId !== event.id || !bundle.isActive || bundle.approvalStatus !== 'approved') {
            throw new Error('Paket bundling tidak tersedia.');
          }
          const qty = Number(bi.quantity);
          const sizeSelections = Array.isArray(bi.merchSizeSelections) ? bi.merchSizeSelections : [];
          // Size merch yang benar-benar dipakai (dari pilihan pembeli) — disimpan agar stok bisa
          // dikembalikan ke varian yang tepat saat order expired/cancel.
          const merchSelections = [];
          for (const item of bundle.items) {
            const needed = item.quantity * qty;
            if (item.itemType === 'ticket') {
              const tt = await tx.ticketType.findUnique({ where: { id: item.ticketTypeId } });
              if (!tt || tt.eventId !== event.id) throw new Error(`Tiket dalam paket ${bundle.name} tidak ditemukan.`);
              if (tt.sold + needed > tt.quota) throw new Error(`Stok tiket dalam paket ${bundle.name} tidak cukup.`);
              await tx.ticketType.update({ where: { id: tt.id }, data: { sold: { increment: needed } } });
              bundleTicketValue += tt.price * needed;
            } else {
              // Merch di paket = PRODUK; pembeli memilih size (varian) saat checkout.
              const merchItem = await tx.merchItem.findUnique({ where: { id: item.merchItemId } });
              if (!merchItem || merchItem.eventId !== event.id) throw new Error(`Merch dalam paket ${bundle.name} tidak ditemukan.`);
              const selection = sizeSelections.find((s) => s.merchItemId === item.merchItemId);
              if (!selection || !selection.variantId) {
                throw new Error(`Pilih size untuk ${merchItem.name} dalam paket ${bundle.name}.`);
              }
              const variant = await tx.merchVariant.findUnique({ where: { id: selection.variantId } });
              if (!variant || variant.merchItemId !== item.merchItemId) {
                throw new Error(`Size tidak valid untuk ${merchItem.name} dalam paket ${bundle.name}.`);
              }
              if (variant.sold + needed > variant.stock) {
                throw new Error(`Stok ${merchItem.name} size ${variant.size} dalam paket ${bundle.name} tidak cukup.`);
              }
              await tx.merchVariant.update({ where: { id: variant.id }, data: { sold: { increment: needed } } });
              merchSelections.push({ merchItemId: item.merchItemId, variantId: variant.id, quantity: needed });
            }
          }
          bundleSubtotal += bundle.price * qty;
          bundleCreate.push({ bundleId: bundle.id, quantity: qty, price: bundle.price, merchSelections });
          itemDetails.push({ id: bundle.id, price: bundle.price, quantity: qty, name: `Paket ${bundle.name}`.slice(0, 50) });
        }

        const subtotal = ticketSubtotal + merchSubtotal + bundleSubtotal;

        // Fee (terpisah per komponen) + pajak dihitung lewat helper bersama (services/ticket.service.js)
        // supaya identik dengan box office. Fallback chain fee spesifik → platformFeePercent → 3.5;
        // pajak 10% hanya dari porsi tiket & hanya kalau event.taxEnabled.
        const { ticketFeePercent, merchFeePercent, bundlingFeePercent, ticketFee, merchFee, bundleFee, feeAmount, taxAmount } =
          computeFeeAndTax(event, { ticketSubtotal, merchSubtotal, bundleSubtotal, bundleTicketValue });

        const feeBearer = event.feeBearer === 'audience' ? 'audience' : 'promotor';

        // Kalau fee ditanggung penonton, fee ditambahkan ke total tagihan. Kalau ditanggung promotor,
        // penonton hanya bayar subtotal + pajak — fee dipotong dari hasil penjualan promotor (tidak ditagih ke penonton).
        const totalAmount = feeBearer === 'audience' ? subtotal + taxAmount + feeAmount : subtotal + taxAmount;

        const orderId = `nexevent-${orderType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const expiredAt = new Date(Date.now() + BOOKING_MINUTES * 60 * 1000);

        const created = await tx.ticketOrder.create({
          data: {
            eventId: event.id,
            orderId,
            orderType,
            buyerName,
            buyerEmail,
            buyerPhone,
            buyerNik: safeNik,
            totalAmount,
            feeAmount,
            feeBearer,
            taxAmount,
            expiredAt,
            status: 'pending',
            items: ticketItems.length > 0
              ? {
                  create: ticketItems.map((item) => ({
                    ticketTypeId: item.ticketTypeId,
                    quantity: Number(item.quantity),
                    price: ticketTypes.find((t) => t.id === item.ticketTypeId).price,
                  })),
                }
              : undefined,
            merchItems: merchCreate.length > 0 ? { create: merchCreate } : undefined,
            bundleItems: bundleCreate.length > 0 ? { create: bundleCreate } : undefined,
          },
          include: { items: true, merchItems: true, bundleItems: true },
        });

        // Fee ditampilkan sebagai baris terpisah per komponen (kalau ditanggung penonton) supaya transparan.
        if (feeBearer === 'audience') {
          if (ticketFee > 0) itemDetails.push({ id: 'fee-ticket', price: ticketFee, quantity: 1, name: `Biaya Layanan Tiket (${ticketFeePercent}%)` });
          if (merchFee > 0) itemDetails.push({ id: 'fee-merch', price: merchFee, quantity: 1, name: `Biaya Layanan Merch (${merchFeePercent}%)` });
          if (bundleFee > 0) itemDetails.push({ id: 'fee-bundle', price: bundleFee, quantity: 1, name: `Biaya Layanan Paket (${bundlingFeePercent}%)` });
        }
        if (taxAmount > 0) {
          itemDetails.push({ id: 'tax', price: taxAmount, quantity: 1, name: 'Pajak Tiket (10%)' });
        }

        const parameter = {
          transaction_details: { order_id: orderId, gross_amount: totalAmount },
          item_details: itemDetails,
          customer_details: { first_name: buyerName, email: buyerEmail, phone: buyerPhone },
        };
        const transaction = await snap.createTransaction(parameter);

        await tx.ticketOrder.update({ where: { id: created.id }, data: { midtransToken: transaction.token } });

        return { ...created, midtransToken: transaction.token };
      });
    } catch (txErr) {
      return res.status(400).json({ success: false, message: txErr.message || 'Gagal membuat pesanan.' });
    }

    return res.status(201).json({
      success: true,
      orderId: order.orderId,
      token: order.midtransToken,
      expiredAt: order.expiredAt,
    });
  } catch (err) {
    console.error('[CREATE ORDER ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/storefront/order/:orderId — PUBLIC
const getOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await prisma.ticketOrder.findUnique({
      where: { orderId },
      omit: { buyerNik: true },
      include: {
        event: { select: { title: true, location: true, event_date: true, slug: true } },
        items: {
          include: {
            ticketType: { select: { name: true, price: true } },
            tickets: { select: { id: true, ticketCode: true, attendeeName: true, isUsed: true } },
          },
        },
        merchItems: {
          include: {
            item: { select: { name: true, imageUrl: true } },
            variant: { select: { size: true } },
          },
        },
        bundleItems: {
          include: {
            bundle: { select: { name: true, imageUrl: true } },
            tickets: { select: { id: true, ticketCode: true, attendeeName: true, isUsed: true } },
          },
        },
      },
    });

    if (!order) return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });

    // Resolve isi tiap paket + size merch yang dipilih pembeli (dari merchSelections) untuk ditampilkan.
    const bundleDetails = await Promise.all(
      (order.bundleItems || []).map(async (bo) => {
        const bundle = await prisma.bundlePackage.findUnique({
          where: { id: bo.bundleId },
          include: { items: true },
        });
        const selections = Array.isArray(bo.merchSelections) ? bo.merchSelections : [];
        const items = await Promise.all(
          (bundle?.items || []).map(async (item) => {
            if (item.itemType === 'ticket') {
              const tt = await prisma.ticketType.findUnique({
                where: { id: item.ticketTypeId },
                select: { name: true },
              });
              return { type: 'ticket', name: tt?.name || 'Tiket', size: null, quantity: item.quantity };
            }
            const merch = await prisma.merchItem.findUnique({
              where: { id: item.merchItemId },
              select: { name: true },
            });
            const selection = selections.find((s) => s.merchItemId === item.merchItemId);
            let size = null;
            if (selection?.variantId) {
              const variant = await prisma.merchVariant.findUnique({
                where: { id: selection.variantId },
                select: { size: true },
              });
              size = variant?.size || null;
            }
            return { type: 'merch', name: merch?.name || 'Merchandise', size, quantity: item.quantity };
          })
        );
        return {
          id: bo.id,
          bundleName: bo.bundle.name,
          quantity: bo.quantity,
          price: bo.price,
          hasMerch: items.some((i) => i.type === 'merch'),
          items,
        };
      })
    );

    return res.json({ success: true, order, bundleDetails });
  } catch (err) {
    console.error('[GET ORDER STATUS ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getEventStorefront, createOrder, getOrderStatus };
