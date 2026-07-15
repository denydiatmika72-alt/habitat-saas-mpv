// Helper bersama untuk generate e-ticket & hitung batas tiket per NIK (anti-calo).
// Dipakai oleh flow online (storefront webhook) dan offline (Ticket Box) supaya logika identik.

const MAX_TICKETS_PER_NIK = 4;
// ⚠️ DEPRECATED bersama fee level-Event. Fee TIDAK punya default lagi: kategori tanpa fee = tidak
// bisa dijual (fail-closed), BUKAN jatuh ke 3.5%. Dipertahankan hanya karena masih di-import
// storefront.controller (tampilan legacy) — jangan dipakai untuk hitung uang baru.
const DEFAULT_FEE_PERCENT = 3.5;

// Rentang fee % yang sah — sama dengan yang dulu divalidasi updateEventFees/approveStorefront.
const FEE_MIN_PERCENT = 1.0;
const FEE_MAX_PERCENT = 5.0;

const makeTicketCode = () => `NE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

// Gate untuk edit/pindah stok (Storefront Roadmap #2). Founder rule: kelola stok hanya boleh
// SETELAH storefront disetujui admin — dan approval itu SEKALIGUS menetapkan fee (approveStorefront).
// feeBearer wajib diisi promotor sebelum bisa ajukan approval, lalu admin menetapkan fee % saat
// approve (bisa dikosongkan → default via resolveFeePercents). Karena fee SELALU ter-resolve lewat
// fallback chain, syarat "fee sudah diatur" praktis terpenuhi begitu status 'approved'. Jadi satu
// kondisi 'approved' sudah mencakup kedua syarat tanpa keliru memblokir event live yang pakai fee default.
const STOCK_EDIT_GATE_MESSAGE =
  'Edit stok hanya bisa dilakukan setelah storefront disetujui admin dan fee sudah diatur.';

function isStockEditAllowed(event) {
  return !!event && event.storefrontStatus === 'approved';
}

// ── FEE PER-KATEGORI (arsitektur baru 2026-07-15) ─────────────────────────────────────────────
// Fee % TIDAK lagi diambil dari Event. Setiap TicketType / MerchItem / BundlePackage punya
// `feePercent` sendiri yang di-set admin SEKALI lalu dikunci permanen (`feeLockedAt`).
// Aturan FAIL-CLOSED: kategori dgn feePercent null TIDAK BISA dijual — tidak ada fallback ke
// default. Ini disengaja: fallback diam-diam ke 3.5% adalah persis celah yang ditutup perubahan
// ini (fee bisa berubah di bawah kaki promotor tanpa dia tahu).

// Fee sah = angka finite di dalam [1.0, 5.0]. Dipakai endpoint admin DAN sebagai jaring pengaman
// saat checkout (kalau nilai di DB entah bagaimana rusak, order gagal — bukan salah tagih).
function isValidFeePercent(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= FEE_MIN_PERCENT && v <= FEE_MAX_PERCENT;
}

// Ambil fee kategori atau LEMPAR. `label`/`category.name` dipakai supaya pesan errornya bisa
// dipahami promotor & admin tanpa buka log.
function requireCategoryFee(category, label) {
  const v = category?.feePercent;
  if (v === null || v === undefined) {
    throw new Error(`${label} "${category?.name ?? '?'}" belum ditetapkan fee-nya oleh admin sehingga belum bisa dijual.`);
  }
  if (!isValidFeePercent(v)) {
    throw new Error(`Fee ${label.toLowerCase()} "${category?.name ?? '?'}" tidak valid (${v}%). Hubungi admin nexEvent.`);
  }
  return v;
}

// Sebuah kategori boleh tampil/dijual hanya kalau fee-nya sudah sah. Dipakai gating storefront
// (filter) supaya pembeli tidak pernah melihat barang yang checkout-nya pasti gagal.
function isSellable(category) {
  return isValidFeePercent(category?.feePercent);
}

// Fee 1 baris = subtotal baris × fee% KATEGORI baris itu, dibulatkan PER BARIS.
// Pembulatan per baris (bukan per grup) wajib karena tiap kategori bisa beda %; hasilnya
// deterministik & bisa diaudit ulang dari line item yang tersimpan.
function lineFee(subtotal, feePercent) {
  return Math.round(subtotal * (feePercent / 100));
}

// Sumber TUNGGAL kalkulasi fee & pajak untuk SEMUA channel (online storefront + Ticket Box).
// Caller mengirim baris yang SUDAH diresolusi: { subtotal, feePercent } per kategori.
// Pajak 10% HANYA dari porsi tiket (tiket langsung + porsi tiket di dalam paket) & HANYA kalau
// event.taxEnabled — aturan ini TIDAK berubah dari sebelumnya.
function computeOrderFeeAndTax(event, { ticketLines = [], merchLines = [], bundleLines = [], bundleTicketValue = 0 } = {}) {
  const sumSub = (lines) => lines.reduce((s, l) => s + l.subtotal, 0);
  const sumFee = (lines) => lines.reduce((s, l) => s + lineFee(l.subtotal, l.feePercent), 0);

  const ticketFee = sumFee(ticketLines);
  const merchFee = sumFee(merchLines);
  const bundleFee = sumFee(bundleLines);
  const feeAmount = ticketFee + merchFee + bundleFee;

  const ticketSubtotal = sumSub(ticketLines);
  const taxableTicketValue = ticketSubtotal + bundleTicketValue;
  const taxAmount = event.taxEnabled ? Math.round(taxableTicketValue * 0.1) : 0;

  return {
    ticketFee, merchFee, bundleFee, feeAmount, taxAmount,
    ticketSubtotal, merchSubtotal: sumSub(merchLines), bundleSubtotal: sumSub(bundleLines),
  };
}

// Generate 1 Ticket per unit untuk tiap TicketOrderItem langsung.
// `client` bisa prisma singleton ATAU tx dari $transaction.
async function generateTicketsForOrderItems(client, orderItems) {
  const created = [];
  for (const item of orderItems) {
    for (let i = 0; i < item.quantity; i++) {
      const ticket = await client.ticket.create({
        data: { orderItemId: item.id, ticketTypeId: item.ticketTypeId, ticketCode: makeTicketCode() },
      });
      created.push(ticket);
    }
  }
  return created;
}

// Hitung total tiket yang sudah dimiliki sebuah NIK di sebuah event — KUMULATIF lintas
// SEMUA channel (online + ticket_box), termasuk tiket di dalam paket bundling.
// Status pending & paid dihitung (booking online yang belum bayar tetap "menahan" kuota NIK).
async function countTicketsForNik(client, eventId, nik) {
  const orders = await client.ticketOrder.findMany({
    where: { eventId, buyerNik: nik, status: { in: ['pending', 'paid'] } },
    include: { items: true, bundleItems: { include: { bundle: { include: { items: true } } } } },
  });
  const direct = orders.flatMap((o) => o.items).reduce((sum, item) => sum + item.quantity, 0);
  const bundle = orders.flatMap((o) => o.bundleItems).reduce((sum, boi) => {
    const t = boi.bundle.items.filter((it) => it.itemType === 'ticket').reduce((s, it) => s + it.quantity, 0);
    return sum + t * boi.quantity;
  }, 0);
  return direct + bundle;
}

module.exports = {
  MAX_TICKETS_PER_NIK,
  DEFAULT_FEE_PERCENT, // DEPRECATED — jangan dipakai untuk hitung uang baru
  FEE_MIN_PERCENT,
  FEE_MAX_PERCENT,
  STOCK_EDIT_GATE_MESSAGE,
  isStockEditAllowed,
  makeTicketCode,
  generateTicketsForOrderItems,
  countTicketsForNik,
  // Fee per-kategori
  isValidFeePercent,
  requireCategoryFee,
  isSellable,
  lineFee,
  computeOrderFeeAndTax,
};
