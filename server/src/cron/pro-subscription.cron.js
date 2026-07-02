const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { sendProExpiryReminder } = require('../../services/email.service');

// 00:01 WIB = 17:01 UTC hari sebelumnya
cron.schedule('1 17 * * *', async () => {
  console.log('[CRON] Checking expired Pro subscriptions...');
  try {
    const expired = await prisma.user.findMany({
      where: { plan: 'pro', proExpiresAt: { lt: new Date() } },
    });

    for (const user of expired) {
      await prisma.user.update({
        where: { id: user.id },
        data: { plan: 'starter' }, // proEventId & proExpiresAt tetap disimpan untuk histori
      });
      console.log(`[CRON] Downgraded user ${user.email} to starter`);
    }

    console.log(`[CRON] Processed ${expired.length} expired subscriptions`);
  } catch (error) {
    console.error('[CRON] Error processing expired subscriptions:', error);
  }
});

// 09:00 WIB = 02:00 UTC
cron.schedule('0 2 * * *', async () => {
  console.log('[CRON] Checking Pro subscriptions expiring in 7 days...');
  try {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const expiringSoon = await prisma.user.findMany({
      where: { plan: 'pro', proExpiresAt: { gte: new Date(), lte: sevenDaysFromNow } },
    });

    for (const user of expiringSoon) {
      const daysLeft = Math.ceil((new Date(user.proExpiresAt) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft === 7) {
        await sendProExpiryReminder(user, daysLeft);
      }
    }
  } catch (error) {
    console.error('[CRON] Error sending expiry reminders:', error);
  }
});

console.log('[CRON] Pro subscription cron jobs registered.');
