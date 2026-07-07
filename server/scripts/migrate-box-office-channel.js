// One-time script: migrasi channel legacy 'box_office' -> 'ticket_box'.
// Konteks: setelah rename total "Box Office" -> "Ticket Box", masih ada order lama ber-channel
// 'box_office' yang jadi tak terlihat di Rekonsiliasi Fee (filter kini pakai 'ticket_box').
// Script ini HANYA mengubah field `channel`, tidak menyentuh field lain.
// Run: node scripts/migrate-box-office-channel.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env'), override: true })
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const prisma = require('../src/lib/prisma')

async function main() {
  // Snapshot baris yang akan dimigrasi (untuk verifikasi field lain tidak berubah).
  const before = await prisma.ticketOrder.findMany({
    where: { channel: 'box_office' },
    select: { id: true, orderId: true, channel: true, status: true, paymentMethod: true, totalAmount: true, feeAmount: true, feeSettled: true },
  })
  console.log(`Baris channel='box_office' sebelum migrasi: ${before.length}`)
  before.forEach((o) => console.log(`  - ${o.orderId} | status=${o.status} paymentMethod=${o.paymentMethod} fee=${o.feeAmount} feeSettled=${o.feeSettled}`))

  if (before.length === 0) {
    console.log('✅ Tidak ada yang perlu dimigrasi. Selesai.')
    return
  }

  // Migrasi: HANYA field channel.
  const result = await prisma.ticketOrder.updateMany({
    where: { channel: 'box_office' },
    data: { channel: 'ticket_box' },
  })
  console.log(`\nupdateMany: ${result.count} baris di-update.`)

  // Verifikasi: tidak ada lagi 'box_office', dan tiap baris kini 'ticket_box' dgn field lain tetap.
  const remaining = await prisma.ticketOrder.count({ where: { channel: 'box_office' } })
  console.log(`Sisa channel='box_office' setelah migrasi: ${remaining} (harus 0)`)

  let unchangedOk = true
  for (const o of before) {
    const after = await prisma.ticketOrder.findUnique({
      where: { id: o.id },
      select: { orderId: true, channel: true, status: true, paymentMethod: true, totalAmount: true, feeAmount: true, feeSettled: true },
    })
    const fieldsSame =
      after.orderId === o.orderId &&
      after.status === o.status &&
      after.paymentMethod === o.paymentMethod &&
      after.totalAmount === o.totalAmount &&
      after.feeAmount === o.feeAmount &&
      after.feeSettled === o.feeSettled
    const ok = after.channel === 'ticket_box' && fieldsSame
    if (!ok) unchangedOk = false
    console.log(`  - ${after.orderId}: channel='${after.channel}' fieldLainUtuh=${fieldsSame} -> ${ok ? 'OK' : 'CEK MANUAL'}`)
  }

  console.log(`\n${remaining === 0 && unchangedOk ? '✅ Migrasi sukses & terverifikasi.' : '❌ Verifikasi gagal — cek manual.'}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
