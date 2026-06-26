require('dotenv/config');
const prisma = require('../src/lib/prisma');

async function fix() {
  const result = await prisma.user.updateMany({
    where: { status: 'pending' },
    data: { status: 'active' }
  });
  console.log('Updated', result.count, 'existing user(s) to active');
  await prisma.$disconnect();
}

fix().catch(err => { console.error(err); process.exit(1); });
