const cron = require('node-cron');
const prisma = require('../lib/prisma');

// Setiap menit — lepas booking tiket pending yang sudah lewat 15 menit
cron.schedule('* * * * *', async () => {
  try {
    const expiredOrders = await prisma.ticketOrder.findMany({
      where: { status: 'pending', expiredAt: { lt: new Date() } },
      include: { items: true },
    });

    for (const order of expiredOrders) {
      await prisma.$transaction([
        ...order.items.map((item) =>
          prisma.ticketType.update({ where: { id: item.ticketTypeId }, data: { sold: { decrement: item.quantity } } })
        ),
        prisma.ticketOrder.update({ where: { id: order.id }, data: { status: 'expired' } }),
      ]);
    }

    if (expiredOrders.length > 0) {
      console.log(`[CRON] Released ${expiredOrders.length} expired ticket orders`);
    }
  } catch (error) {
    console.error('[CRON] Error releasing expired orders:', error);
  }
});

console.log('[CRON] Ticket booking cron job registered.');
