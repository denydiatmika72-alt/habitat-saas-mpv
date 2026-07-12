// Helper bersama untuk generate e-ticket & hitung batas tiket per NIK (anti-calo).
// Dipakai oleh flow online (storefront webhook) dan offline (Ticket Box) supaya logika identik.

const MAX_TICKETS_PER_NIK = 4;
const DEFAULT_FEE_PERCENT = 3.5;

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

// Resolusi fee % per tipe order dengan fallback chain: fee spesifik → platformFeePercent (legacy) → 3.5.
// `?? ` (nullish) menjaga nilai 0 yang di-set admin secara eksplisit (tidak jatuh ke fallback).
function resolveFeePercents(event) {
  return {
    ticketFeePercent: event.ticketFeePercent ?? event.platformFeePercent ?? DEFAULT_FEE_PERCENT,
    merchFeePercent: event.merchFeePercent ?? event.platformFeePercent ?? DEFAULT_FEE_PERCENT,
    bundlingFeePercent: event.bundlingFeePercent ?? event.platformFeePercent ?? DEFAULT_FEE_PERCENT,
  };
}

// Sumber tunggal kalkulasi fee & pajak untuk SEMUA channel (online storefront + Ticket Box).
// Fee dihitung TERPISAH per komponen (tiket/merch/paket). Pajak 10% HANYA dari porsi tiket
// (tiket langsung + porsi tiket di dalam paket) dan HANYA kalau `event.taxEnabled`.
// Semua subtotal default 0 → caller ticket-only (Ticket Box) cukup kirim `ticketSubtotal`.
function computeFeeAndTax(event, { ticketSubtotal = 0, merchSubtotal = 0, bundleSubtotal = 0, bundleTicketValue = 0 } = {}) {
  const { ticketFeePercent, merchFeePercent, bundlingFeePercent } = resolveFeePercents(event);
  const ticketFee = Math.round(ticketSubtotal * (ticketFeePercent / 100));
  const merchFee = Math.round(merchSubtotal * (merchFeePercent / 100));
  const bundleFee = Math.round(bundleSubtotal * (bundlingFeePercent / 100));
  const feeAmount = ticketFee + merchFee + bundleFee;

  const taxableTicketValue = ticketSubtotal + bundleTicketValue;
  const taxAmount = event.taxEnabled ? Math.round(taxableTicketValue * 0.1) : 0;

  return { ticketFeePercent, merchFeePercent, bundlingFeePercent, ticketFee, merchFee, bundleFee, feeAmount, taxAmount };
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
  DEFAULT_FEE_PERCENT,
  STOCK_EDIT_GATE_MESSAGE,
  isStockEditAllowed,
  makeTicketCode,
  generateTicketsForOrderItems,
  countTicketsForNik,
  resolveFeePercents,
  computeFeeAndTax,
};
