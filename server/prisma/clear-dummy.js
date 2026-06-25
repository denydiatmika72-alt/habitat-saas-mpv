require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const prisma = require('../src/lib/prisma')

async function clearDummyData() {
  console.log('Starting database cleanup...\n')

  // Leaf/junction tables — must go first to satisfy FK constraints
  const r1 = await prisma.sponsorDealBenefit.deleteMany()
  console.log(`✓ sponsorDealBenefit     — ${r1.count} rows deleted`)

  const r2 = await prisma.sponsorPackageBenefit.deleteMany()
  console.log(`✓ sponsorPackageBenefit  — ${r2.count} rows deleted`)

  const r3 = await prisma.purchaseOrderItem.deleteMany()
  console.log(`✓ purchaseOrderItem      — ${r3.count} rows deleted`)

  const r4 = await prisma.clientAccount.deleteMany()
  console.log(`✓ clientAccount          — ${r4.count} rows deleted`)

  const r5 = await prisma.sponsorInvoice.deleteMany()
  console.log(`✓ sponsorInvoice         — ${r5.count} rows deleted`)

  const r6 = await prisma.sponsorDeliverable.deleteMany()
  console.log(`✓ sponsorDeliverable     — ${r6.count} rows deleted`)

  // Mid-level tables
  const r7 = await prisma.sponsorDeal.deleteMany()
  console.log(`✓ sponsorDeal            — ${r7.count} rows deleted`)

  const r8 = await prisma.purchaseOrder.deleteMany()
  console.log(`✓ purchaseOrder          — ${r8.count} rows deleted`)

  const r9 = await prisma.sponsorPackage.deleteMany()
  console.log(`✓ sponsorPackage         — ${r9.count} rows deleted`)

  const r10 = await prisma.sponsorBenefit.deleteMany()
  console.log(`✓ sponsorBenefit         — ${r10.count} rows deleted`)

  const r11 = await prisma.sponsorThreshold.deleteMany()
  console.log(`✓ sponsorThreshold       — ${r11.count} rows deleted`)

  const r12 = await prisma.inviteCode.deleteMany()
  console.log(`✓ inviteCode             — ${r12.count} rows deleted`)

  // Budget chain (FK cascade: BudgetItem → BudgetCategory → Budget → Event)
  const r13 = await prisma.budgetItem.deleteMany()
  console.log(`✓ budgetItem             — ${r13.count} rows deleted`)

  const r14 = await prisma.budgetCategory.deleteMany()
  console.log(`✓ budgetCategory         — ${r14.count} rows deleted`)

  const r15 = await prisma.budget.deleteMany()
  console.log(`✓ budget                 — ${r15.count} rows deleted`)

  // Top-level data tables
  const r16 = await prisma.event.deleteMany()
  console.log(`✓ event                  — ${r16.count} rows deleted`)

  console.log('\n✅ Done. All dummy data cleared.')
  console.log('   Preserved: users, promoterSettings')
}

clearDummyData()
  .catch((err) => { console.error('Error during cleanup:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
