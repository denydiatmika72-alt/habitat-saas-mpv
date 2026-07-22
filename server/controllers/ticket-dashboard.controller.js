const prisma = require('../src/lib/prisma');

const { lineFee } = require('../services/ticket.service');

// Dashboard Tiket & Pencairan (Layer 2 roadmap navigasi) — endpoint READ-ONLY untuk halaman
// hub /dashboard/ticketing. Tidak menulis apa pun; tidak menyentuh logika order/fee/pajak/payout.
//
// ── DASAR ANGKA Rp = **NET/BERSIH**, konsisten dengan P&L (2026-07-16) ────────────────────────
// Sebelumnya halaman ini sengaja menampilkan angka KOTOR karena fee level-Event bikin porsi fee
// per kategori mustahil diketahui untuk order "mixed" (fee cuma disimpan agregat per-order, dan
// admin bisa mengubah fee kapan saja → recompute tak bisa dipercaya). Setelah migrasi
// FEE PER-KATEGORI (2026-07-15) alasan itu HILANG: tiap TicketType/MerchItem/BundlePackage punya
// `feePercent` sendiri yang DIKUNCI PERMANEN (`feeLockedAt`) dan tiap line item menyimpan `price`
// historisnya → fee per baris bisa dihitung ulang PERSIS seperti saat checkout. Jadi angka net
// per kategori sekarang eksak, termasuk untuk order mixed.
//
// ── RUMUS (mengikuti P&L & payout — JANGAN dikarang ulang) ────────────────────────────────────
// Referensi: `services/pl-report.service.js` → nexeventSalesTotal = Σ(totalAmount − feeAmount).
// Bongkar rumus itu (totalAmount = subtotal + tax + (audience ? fee : 0)):
//   feeBearer 'audience' → net = subtotal + tax        (fee dibayar PEMBELI di atas harga)
//   feeBearer 'promotor' → net = subtotal + tax − fee   (fee diserap promotor)
// Sehingga: net = subtotal + tax − (feeBearer === 'promotor' ? fee : 0)
//
// DUA JEBAKAN yang sengaja DIHINDARI di sini:
//   1. PAJAK TIDAK DIPOTONG. Pajak 10% adalah HAK PROMOTOR sepenuhnya — nexEvent cuma ambil fee.
//      Lihat payout.controller ("Pajak (taxAmount) TIDAK dipotong — itu hak promotor") & P&L.
//      Mengurangi pajak dari pendapatan = salah, dan bikin angka meleset dari P&L.
//   2. feeBearer WAJIB diperhitungkan. Kalau 'audience', fee TIDAK boleh dikurangi dari promotor
//      (pembeli yang bayar). Memotongnya tetap = understate pendapatan promotor.
//
// ── PEMBAGIAN ANGKA ──────────────────────────────────────────────────────────────────────────
//   kartu tiket/merch/bundling = net PER KATEGORI setelah fee  (pajak TIDAK diatribusikan — lihat
//     di bawah)
//   taxTotal = Σ taxAmount tersimpan. Pajak lahir dari porsi TIKET (tiket langsung + porsi tiket
//     dalam paket) dan disimpan sebagai SATU angka bulat per order; memecahnya ke kartu tiket vs
//     bundling butuh aproksimasi (basisnya `bundleTicketValue` yang TIDAK dipersist). Jadi pajak
//     dilaporkan UTUH terpisah, bukan ditebak-bagi ke kartu.
//   totalNet = Σ(totalAmount − feeAmount) → dihitung dari nilai TERSIMPAN, rumus PERSIS sama
//     dengan P&L. Ini yang menjamin totalNet == P&L apa pun yang terjadi.
//   Identitas yang dijaga tes: kartu(tiket+merch+bundling) + taxTotal === totalNet === P&L.

const safe = (n) => Math.round(Number(n) || 0);

// Ambang granularitas: rentang <= 45 hari → titik harian; > 45 hari → agregat mingguan (+ drill-down).
const DAILY_MAX_DAYS = 45;

// ── Helper tanggal (WIB) ───────────────────────────────────────────────────────────────────────
// Hari dipotong menurut Asia/Jakarta, bukan UTC — kalau pakai UTC, order jam 00:30 WIB akan jatuh ke
// tanggal kemarin di grafik. `en-CA` menghasilkan format "YYYY-MM-DD".
const JAKARTA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Timestamp asli → kunci hari WIB ("YYYY-MM-DD").
const dayKey = (d) => JAKARTA_DAY.format(new Date(d));

// Setelah jadi kunci, SEMUA aritmetika tanggal dilakukan di anchor UTC supaya tidak kena geser tz
// dua kali. parseKey/keyOf adalah pasangan yang konsisten — jangan campur dengan JAKARTA_DAY.
const parseKey = (k) => new Date(`${k}T00:00:00Z`);
const keyOf = (d) => d.toISOString().slice(0, 10);
const addDays = (k, n) => {
  const d = parseKey(k);
  d.setUTCDate(d.getUTCDate() + n);
  return keyOf(d);
};
const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
const isValidKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && !Number.isNaN(parseKey(k).getTime());

// Senin sebagai awal minggu (konvensi kalender ID).
const weekStartKey = (k) => {
  const d = parseKey(k);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return keyOf(d);
};

// ── Data access ────────────────────────────────────────────────────────────────────────────────
// Ownership: event WAJIB milik promotor yang login. Pola sama dgn getOrdersByEvent (404, bukan 403).
async function assertEventOwned(eventId, userId) {
  return prisma.event.findFirst({ where: { id: eventId, promotor_id: userId }, select: { id: true, title: true } });
}

// Ambil order berbayar + line item-nya BESERTA fee% kategori masing-masing. Satu query dipakai
// bersama oleh summary & trend supaya dua endpoint mustahil menyimpang angkanya.
// `price` diambil dari LINE ITEM (harga historis saat beli), bukan dari kategori — harga kategori
// bisa diedit promotor setelahnya, line item tidak. Dipadu `feePercent` yang terkunci permanen,
// fee per baris bisa direproduksi persis seperti saat checkout.
async function fetchPaidOrders(eventId) {
  return prisma.ticketOrder.findMany({
    where: { status: 'paid', eventId },
    select: {
      paidAt: true,
      createdAt: true,
      // Nilai TERSIMPAN — dasar totalNet (rumus identik P&L) & atribusi fee.
      totalAmount: true,
      feeAmount: true,
      taxAmount: true,
      feeBearer: true,
      items: { select: { quantity: true, price: true, ticketType: { select: { feePercent: true } } } },
      merchItems: { select: { quantity: true, price: true, item: { select: { feePercent: true } } } },
      bundleItems: { select: { quantity: true, price: true, bundle: { select: { feePercent: true } } } },
    },
  });
}

// Net satu order = rumus P&L, dari nilai tersimpan. Sumber kebenaran untuk total & trend.
const orderNet = (o) => safe(o.totalAmount) - safe(o.feeAmount);

// Jumlahkan qty, subtotal (kotor), dan fee dari sekumpulan line item satu kategori.
// `feeOf` mengambil feePercent kategori baris tsb (bentuk relasinya beda per tipe).
// Fee dibulatkan PER BARIS lewat `lineFee` — helper yang SAMA dengan yang dipakai checkout
// (services/ticket.service.js), supaya hasilnya identik dengan feeAmount yang tersimpan.
const rollup = (lines, feeOf) =>
  lines.reduce(
    (acc, l) => {
      const subtotal = safe(l.quantity) * safe(l.price);
      const pct = feeOf(l);
      acc.count += safe(l.quantity);
      acc.subtotal += subtotal;
      // pct null hanya mungkin untuk order pra-migrasi fee-per-kategori — dan itu MUSTAHIL:
      // saat migrasi (2026-07-15) belum ada satu pun order, dan sejak itu checkout fail-closed
      // (requireCategoryFee) menolak kategori tanpa fee, fee terkunci permanen, serta FK tanpa
      // cascade melarang kategori ber-order dihapus. Dijaga `typeof` supaya kalaupun muncul,
      // hasilnya fee 0 (net = kotor) — bukan NaN yang merusak seluruh angka halaman.
      acc.fee += typeof pct === 'number' ? lineFee(subtotal, pct) : 0;
      return acc;
    },
    { count: 0, subtotal: 0, fee: 0 },
  );

// Net kategori = subtotal − fee, TAPI fee hanya dipotong kalau PROMOTOR yang menanggungnya.
// Kalau 'audience', pembeli sudah membayar fee di atas harga → promotor terima subtotal penuh.
const categoryNet = (r, feeBearer) => r.subtotal - (feeBearer === 'promotor' ? r.fee : 0);

// Order berbayar SEHARUSNYA punya paidAt; createdAt hanya jaring pengaman supaya baris data lama
// tidak hilang diam-diam dari grafik.
const orderDate = (o) => dayKey(o.paidAt ?? o.createdAt);

// Agregasi net per kategori + pajak + totalNet dari sekumpulan order berbayar.
// DIPAKAI BERSAMA `getDashboardSummary` (kartu ringkasan) DAN `getCategoryBreakdown` (angka
// bundling) — supaya kartu "Total Bundling Terjual" dan baris bundling di breakdown MUSTAHIL beda.
// `feeBearer` dibaca PER ORDER (snapshot saat checkout), bukan dari Event sekarang → diakumulasi
// per order, bukan sekali di akhir.
function computeCategoryTotals(orders) {
  const acc = {
    tickets: { count: 0, revenue: 0 },
    merch: { count: 0, revenue: 0 },
    bundling: { count: 0, revenue: 0 },
  };
  let taxTotal = 0;
  let totalNet = 0;
  let feeTotal = 0;

  for (const o of orders) {
    const bearer = o.feeBearer === 'audience' ? 'audience' : 'promotor';
    const groups = {
      tickets: rollup(o.items, (l) => l.ticketType?.feePercent),
      merch: rollup(o.merchItems, (l) => l.item?.feePercent),
      bundling: rollup(o.bundleItems, (l) => l.bundle?.feePercent),
    };
    for (const key of ['tickets', 'merch', 'bundling']) {
      acc[key].count += groups[key].count;
      acc[key].revenue += categoryNet(groups[key], bearer);
      feeTotal += groups[key].fee;
    }
    taxTotal += safe(o.taxAmount);
    totalNet += orderNet(o); // rumus P&L, dari nilai tersimpan
  }

  return { ...acc, taxTotal, feeTotal, totalNet };
}

// ── GET /api/tickets/dashboard-summary?eventId= ────────────────────────────────────────────────
const getDashboardSummary = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

    const event = await assertEventOwned(eventId, req.user.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const orders = await fetchPaidOrders(eventId);
    const { tickets, merch, bundling, taxTotal, feeTotal, totalNet } = computeCategoryTotals(orders);

    return res.json({
      success: true,
      event,
      basis: 'net', // net setelah fee platform — lihat catatan di kepala file
      orderCount: orders.length,
      tickets,
      merch,
      bundling,
      // Pajak dilaporkan utuh & terpisah: hak promotor, tapi bukan pendapatan kategori mana pun.
      taxTotal,
      feeTotal, // fee platform yang dihitung ulang dari fee% terkunci (audit/silang-cek)
      // Identitas: tickets + merch + bundling + taxTotal === totalNet === P&L nexeventSalesTotal.
      totalNet,
    });
  } catch (err) {
    console.error('[TICKET DASHBOARD SUMMARY ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── GET /api/tickets/sales-trend?eventId=[&weekOf=YYYY-MM-DD] ──────────────────────────────────
// Tanpa weekOf : server yang menentukan granularitas — <=45 hari → harian, >45 hari → mingguan.
// Dengan weekOf: paksa 7 titik harian untuk minggu tsb (drill-down dari bar mingguan).
const getSalesTrend = async (req, res) => {
  try {
    const { eventId, weekOf } = req.query;
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });
    if (weekOf !== undefined && !isValidKey(weekOf))
      return res.status(400).json({ success: false, message: 'Format weekOf tidak valid (harus YYYY-MM-DD).' });

    const event = await assertEventOwned(eventId, req.user.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const orders = await fetchPaidOrders(eventId);

    const empty = {
      success: true,
      event,
      basis: 'net',
      granularity: 'daily',
      weekOf: null,
      range: null,
      points: [],
    };
    if (orders.length === 0) return res.json(empty);

    // Net per order = rumus P&L dari nilai tersimpan (totalAmount − feeAmount), TERMASUK pajak
    // (hak promotor). Jadi Σ semua titik trend === `totalNet` di dashboard-summary === P&L.
    // Sengaja TIDAK memakai atribusi per-kategori di sini: trend memang bukan per kategori, dan
    // memakai nilai tersimpan menjamin garis trend tak pernah menyimpang dari total.
    const byDay = new Map();
    for (const o of orders) {
      const k = orderDate(o);
      const cur = byDay.get(k) ?? { orderCount: 0, revenue: 0 };
      cur.orderCount += 1;
      cur.revenue += orderNet(o);
      byDay.set(k, cur);
    }

    const at = (k) => byDay.get(k) ?? { orderCount: 0, revenue: 0 };
    const today = dayKey(new Date());
    const firstPaid = [...byDay.keys()].sort()[0];

    // ── Drill-down: 7 titik harian untuk minggu yang diminta ──
    if (weekOf) {
      const start = weekStartKey(weekOf);
      const points = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(start, i);
        return { date, ...at(date) };
      });
      return res.json({
        success: true,
        event,
        basis: 'net',
        granularity: 'daily',
        weekOf: start,
        range: { start, end: addDays(start, 6) },
        points,
      });
    }

    // Rentang selalu sampai hari ini, kecuali kalau ada order ber-tanggal di masa depan (jam server
    // meleset / data aneh) — jangan sampai titik itu terpotong dari grafik.
    const lastDay = [...byDay.keys()].sort().slice(-1)[0];
    const end = lastDay > today ? lastDay : today;
    const start = firstPaid;
    const span = diffDays(start, end) + 1; // inklusif

    // ── Harian ──
    if (span <= DAILY_MAX_DAYS) {
      const points = Array.from({ length: span }, (_, i) => {
        const date = addDays(start, i);
        return { date, ...at(date) };
      });
      return res.json({
        success: true,
        event,
        basis: 'net',
        granularity: 'daily',
        weekOf: null,
        range: { start, end },
        points,
      });
    }

    // ── Mingguan (bucket Senin; `date` = tanggal awal minggu, dipakai frontend sbg param weekOf) ──
    const firstWeek = weekStartKey(start);
    const lastWeek = weekStartKey(end);
    const weekCount = Math.round(diffDays(firstWeek, lastWeek) / 7) + 1;
    const points = Array.from({ length: weekCount }, (_, i) => {
      const wStart = addDays(firstWeek, i * 7);
      const agg = { orderCount: 0, revenue: 0 };
      for (let d = 0; d < 7; d++) {
        const day = at(addDays(wStart, d));
        agg.orderCount += day.orderCount;
        agg.revenue += day.revenue;
      }
      return { date: wStart, weekEnd: addDays(wStart, 6), ...agg };
    });

    return res.json({
      success: true,
      event,
      basis: 'net',
      granularity: 'weekly',
      weekOf: null,
      range: { start, end },
      points,
    });
  } catch (err) {
    console.error('[TICKET SALES TREND ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── GET /api/tickets/category-breakdown?eventId= ───────────────────────────────────────────────
// Breakdown penjualan per kategori: tiket per JENIS, merch per SIZE, bundling sebagai TOTAL.
//
// ── DEFINISI "TERJUAL" DI SINI (penting, baca sebelum ubah) ───────────────────────────────────
// terjual = unit dari order **BERBAYAR** saja (`status:'paid'`), konsisten dgn seluruh halaman ini
// (kartu ringkasan & grafik tren juga paid-only).
//
// **SENGAJA BUKAN kolom `TicketType.sold` / `MerchVariant.sold`.** Kolom itu di-increment saat order
// DIBUAT (masih `pending`) untuk menahan stok, lalu di-decrement kalau booking kedaluwarsa (cron 15
// menit) — jadi isinya "terpesan + terbayar", bukan penjualan nyata. Halaman Manajemen Tiket memang
// menampilkan kolom `sold` itu (benar untuk ketersediaan stok), sehingga angkanya bisa SEDIKIT LEBIH
// TINGGI dari sini selama ada booking yang belum dibayar. Beda ini DISENGAJA, bukan bug:
//   Manajemen Tiket  → "berapa stok yang sudah tertahan" (operasional)
//   Dashboard ini    → "berapa yang benar-benar terjual & menghasilkan uang" (penjualan)
//
// ── TIKET DI DALAM PAKET IKUT DIHITUNG ────────────────────────────────────────────────────────
// Paket bundling memakan kuota tiket & stok merch komponennya. Kalau kontribusi paket tidak ikut
// dihitung di baris tiket/merch, catatan di UI ("penjualan bundling sudah tercermin di angka di
// atas") jadi BOHONG dan promotor salah baca sisa kuota. Karena itu:
//   - tiket: dihitung dari tabel `Ticket` (1 baris = 1 tiket) yang mencakup DUA jalur —
//     `orderItem` (beli tiket langsung) dan `bundleOrderItem` (tiket di dalam paket). Keduanya
//     menyimpan `ticketTypeId`. Pola OR ini meniru `audience-report.controller` (preseden ada).
//     Baris `Ticket` hanya lahir untuk order berbayar → otomatis paid-only.
//   - merch: `MerchOrderItem` (beli langsung) + `BundleOrderItem.merchSelections` (JSON berisi
//     `[{ merchItemId, variantId, quantity }]` — size yang dipilih pembeli untuk paketnya).
const getCategoryBreakdown = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

    const event = await assertEventOwned(eventId, req.user.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const paidOrder = { order: { status: 'paid', eventId } };

    const [ticketTypeRows, merchRows, ticketCounts, merchDirect, bundleSelectionRows, orders] = await Promise.all([
      // Semua jenis tiket event (termasuk yang belum laku → tetap tampil dgn 0 terjual).
      prisma.ticketType.findMany({
        where: { eventId },
        select: { id: true, name: true, quota: true, isActive: true },
        orderBy: { price: 'asc' },
      }),
      prisma.merchItem.findMany({
        where: { eventId },
        select: {
          id: true, name: true, isActive: true,
          variants: { select: { id: true, size: true, stock: true }, orderBy: { size: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Tiket terjual per jenis — mencakup tiket langsung DAN tiket di dalam paket.
      prisma.ticket.groupBy({
        by: ['ticketTypeId'],
        where: {
          ticketTypeId: { not: null },
          OR: [{ orderItem: paidOrder }, { bundleOrderItem: paidOrder }],
        },
        _count: { _all: true },
      }),
      // Merch terjual per varian — jalur beli langsung.
      prisma.merchOrderItem.groupBy({
        by: ['variantId'],
        where: paidOrder,
        _sum: { quantity: true },
      }),
      // Merch di dalam paket — size tersimpan di JSON merchSelections.
      prisma.bundleOrderItem.findMany({ where: paidOrder, select: { merchSelections: true } }),
      fetchPaidOrders(eventId),
    ]);

    const soldByType = new Map(ticketCounts.map((r) => [r.ticketTypeId, safe(r._count?._all)]));

    // Gabung merch langsung + merch dari paket, per variantId.
    const soldByVariant = new Map(merchDirect.map((r) => [r.variantId, safe(r._sum?.quantity)]));
    for (const row of bundleSelectionRows) {
      const sel = Array.isArray(row.merchSelections) ? row.merchSelections : [];
      for (const s of sel) {
        if (!s?.variantId) continue;
        soldByVariant.set(s.variantId, (soldByVariant.get(s.variantId) ?? 0) + safe(s.quantity));
      }
    }

    const ticketTypes = ticketTypeRows.map((tt) => ({
      id: tt.id,
      name: tt.name,
      isActive: tt.isActive,
      sold: soldByType.get(tt.id) ?? 0,
      // `quota` NOT NULL di schema → "kuota tak terbatas" tidak bisa dinyatakan. Nilai <= 0
      // diperlakukan "tanpa kuota" oleh frontend (tampil tanpa progress bar) sebagai jaring pengaman.
      quota: safe(tt.quota),
    }));

    const merchandise = merchRows.map((m) => ({
      id: m.id,
      productName: m.name,
      isActive: m.isActive,
      variants: m.variants.map((v) => ({
        id: v.id,
        size: v.size,
        sold: soldByVariant.get(v.id) ?? 0,
        stock: safe(v.stock),
      })),
    }));

    // Bundling: TOTAL saja (tanpa progress bar) — BundlePackage TIDAK punya kuota sendiri; stoknya
    // menumpang tiket & merch komponennya. Angka diambil dari helper yang SAMA dengan kartu
    // ringkasan → mustahil beda. `revenue` = net (fee dipotong hanya kalau promotor menanggung).
    const { bundling } = computeCategoryTotals(orders);

    return res.json({
      success: true,
      event,
      basis: 'net',
      ticketTypes,
      merchandise,
      bundlingTotal: { sold: bundling.count, revenue: bundling.revenue },
    });
  } catch (err) {
    console.error('[TICKET CATEGORY BREAKDOWN ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getDashboardSummary,
  getSalesTrend,
  getCategoryBreakdown,
  // Di-reuse dashboard.controller.js (ringkasan KPI) — supaya angka "tiket terjual" di kartu
  // Akses Cepat MUSTAHIL beda dari kartu ringkasan hub Ticketing (sumber & rumus sama persis).
  fetchPaidOrders,
  computeCategoryTotals,
};
