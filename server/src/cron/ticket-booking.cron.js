const cron = require('node-cron');
const prisma = require('../lib/prisma');

// Setiap menit — lepas booking tiket pending yang sudah lewat 15 menit
cron.schedule('* * * * *', async () => {
  try {
    const expiredOrders = await prisma.ticketOrder.findMany({
      where: { status: 'pending', expiredAt: { lt: new Date() } },
      include: {
        items: true,
        merchItems: true,
        bundleItems: { include: { bundle: { include: { items: true } } } },
      },
    });

    for (const order of expiredOrders) {
      const ops = [
        ...order.items.map((item) =>
          prisma.ticketType.update({ where: { id: item.ticketTypeId }, data: { sold: { decrement: item.quantity } } })
        ),
        ...order.merchItems.map((m) =>
          prisma.merchVariant.update({ where: { id: m.variantId }, data: { sold: { decrement: m.quantity } } })
        ),
      ];
      // Bundle: kembalikan stok tiap item paket × jumlah paket yang dipesan.
      for (const boi of order.bundleItems) {
        // Tiket — dari definisi paket.
        for (const it of boi.bundle.items) {
          if (it.itemType === 'ticket' && it.ticketTypeId) {
            const dec = it.quantity * boi.quantity;
            ops.push(prisma.ticketType.update({ where: { id: it.ticketTypeId }, data: { sold: { decrement: dec } } }));
          }
        }
        // Merch — restore ke varian yang dipilih pembeli (merchSelections).
        const selections = Array.isArray(boi.merchSelections) ? boi.merchSelections : [];
        for (const sel of selections) {
          if (sel.variantId && sel.quantity) {
            ops.push(prisma.merchVariant.update({ where: { id: sel.variantId }, data: { sold: { decrement: sel.quantity } } }));
          }
        }
      }
      ops.push(prisma.ticketOrder.update({ where: { id: order.id }, data: { status: 'expired' } }));
      await prisma.$transaction(ops);
    }

    if (expiredOrders.length > 0) {
      console.log(`[CRON] Released ${expiredOrders.length} expired ticket orders`);
    }
  } catch (error) {
    console.error('[CRON] Error releasing expired orders:', error);
  }
});

console.log('[CRON] Ticket booking cron job registered.');
