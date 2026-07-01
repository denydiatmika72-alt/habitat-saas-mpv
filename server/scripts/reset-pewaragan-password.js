require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), override: true })
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const bcrypt = require('bcryptjs')
const prisma = require('../src/lib/prisma')

async function main() {
  const targetEmail = 'pewaraganstudiodesain@gmail.com'
  const newPassword = 'Sponsor2026!'

  const deals = await prisma.sponsorDeal.findMany({
    where: { email: targetEmail },
    select: { id: true, sponsorName: true, status: true },
  })

  if (deals.length === 0) {
    console.log(`❌ Tidak ada SponsorDeal dengan email: ${targetEmail}`)
    process.exit(1)
  }

  const hashed = await bcrypt.hash(newPassword, 10)

  for (const deal of deals) {
    console.log(`Deal: ${deal.id} — ${deal.sponsorName} (${deal.status})`)
    const account = await prisma.clientAccount.findUnique({ where: { dealId: deal.id } })
    if (!account) {
      console.log('  ⚠ Tidak ada ClientAccount — skip')
      continue
    }
    await prisma.clientAccount.update({
      where: { dealId: deal.id },
      data: { password: hashed },
    })
    console.log(`  ✓ Password direset untuk username: ${account.username}`)
  }

  console.log(`\n✅ Password baru: ${newPassword}`)
  console.log(`   Email: ${targetEmail}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
