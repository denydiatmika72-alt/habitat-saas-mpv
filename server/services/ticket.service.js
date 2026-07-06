// Helper bersama untuk generate e-ticket & hitung batas tiket per NIK (anti-calo).
// Dipakai oleh flow online (storefront webhook) dan offline (box office) supaya logika identik.

const MAX_TICKETS_PER_NIK = 4;

const makeTicketCode = () => `NE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

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
// SEMUA channel (online + box_office), termasuk tiket di dalam paket bundling.
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

module.exports = { MAX_TICKETS_PER_NIK, makeTicketCode, generateTicketsForOrderItems, countTicketsForNik };
