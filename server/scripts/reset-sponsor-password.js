// One-time script: reset password ClientAccount untuk sponsor info@gemilang.com
// Run: node scripts/reset-sponsor-password.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), override: true })
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const bcrypt = require('bcryptjs')
const prisma = require('../src/lib/prisma')

async function main() {
  const targetEmail = 'info@gemilang.com'
  const newPassword = 'NexEvent2026!'

  // Cari semua deal dengan email ini
  const deals = await prisma.sponsorDeal.findMany({
    where: { email: targetEmail },
    select: { id: true, sponsorName: true, status: true },
  })

  if (deals.length === 0) {
    console.log(`❌ Tidak ada SponsorDeal dengan email: ${targetEmail}`)
    console.log('Mencoba tabel users...')
    // Fallback: coba di tabel users
    const updated = await prisma.user.updateMany({
      where: { email: targetEmail },
      data: { password: await bcrypt.hash(newPassword, 10) },
    })
    console.log(`Users updated: ${updated.count}`)
    process.exit(0)
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  let totalUpdated = 0

  for (const deal of deals) {
    console.log(`\nDeal ditemukan: ${deal.id} — ${deal.sponsorName} (${deal.status})`)
    const account = await prisma.clientAccount.findUnique({ where: { dealId: deal.id } })
    if (!account) {
      console.log('  ⚠ Tidak ada ClientAccount untuk deal ini — skip')
      continue
    }
    await prisma.clientAccount.update({
      where: { dealId: deal.id },
      data: { password: hashed },
    })
    console.log(`  ✓ Password direset untuk username: ${account.username}`)
    totalUpdated++
  }

  console.log(`\n✅ Total akun yang direset: ${totalUpdated}`)
  console.log(`   Email     : ${targetEmail}`)
  console.log(`   Username  : (lihat output di atas)`)
  console.log(`   Password baru: ${newPassword}`)
  console.log(`\nLogin endpoint: POST /api/sponsor/accounts/verify`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
