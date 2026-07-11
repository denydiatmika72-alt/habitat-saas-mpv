const prisma = require('../src/lib/prisma')

const getOtherIncomes = async (req, res) => {
  try {
    const { eventId } = req.query
    const userId = req.user.id
    if (!eventId) return res.status(400).json({ success: false, message: 'eventId diperlukan.' })

    const items = await prisma.otherIncome.findMany({
      where: { eventId, userId },
      orderBy: { date: 'desc' },
    })
    res.json({ success: true, data: items })
  } catch (err) {
    console.error('[other-income] getOtherIncomes error:', err)
    res.status(500).json({ success: false, message: 'Gagal mengambil data.' })
  }
}

// Kategori valid untuk Pemasukan Lain. "tiket_platform_lain" = penjualan tiket di platform
// EKSTERNAL (LOKET/Tix.id/dll) yang diinput manual — BUKAN penjualan tiket nexEvent sendiri.
const VALID_OI_CATEGORIES = ['merchandise', 'donasi', 'tiket_platform_lain', 'lainnya']

const createOtherIncome = async (req, res) => {
  try {
    const userId = req.user.id
    const { eventId, description, amount, date, category, platform } = req.body

    if (!eventId || !description || !amount) {
      return res.status(400).json({ success: false, message: 'eventId, description, dan amount diperlukan.' })
    }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: 'Amount harus lebih dari 0.' })
    }

    // Kategori opsional; default "lainnya" kalau tidak dikirim. Tolak nilai tak dikenal.
    const cat = category ? String(category) : 'lainnya'
    if (!VALID_OI_CATEGORIES.includes(cat)) {
      return res.status(400).json({ success: false, message: 'Kategori pemasukan tidak valid.' })
    }
    // Platform HANYA relevan untuk tiket platform lain — abaikan (null) untuk kategori lain agar bersih.
    const plat = cat === 'tiket_platform_lain' ? (platform ? String(platform) : null) : null
    if (cat === 'tiket_platform_lain' && !plat) {
      return res.status(400).json({ success: false, message: 'Platform wajib dipilih untuk kategori Tiket Platform Lain.' })
    }

    const item = await prisma.otherIncome.create({
      data: {
        eventId,
        userId,
        description,
        amount: amt,
        category: cat,
        platform: plat,
        date: date ? new Date(date) : new Date(),
      },
    })
    res.status(201).json({ success: true, data: item })
  } catch (err) {
    console.error('[other-income] createOtherIncome error:', err)
    res.status(500).json({ success: false, message: 'Gagal menyimpan data.' })
  }
}

const deleteOtherIncome = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const item = await prisma.otherIncome.findUnique({ where: { id } })
    if (!item) return res.status(404).json({ success: false, message: 'Data tidak ditemukan.' })
    if (item.userId !== userId) return res.status(403).json({ success: false, message: 'Tidak diizinkan.' })

    await prisma.otherIncome.delete({ where: { id } })
    res.json({ success: true })
  } catch (err) {
    console.error('[other-income] deleteOtherIncome error:', err)
    res.status(500).json({ success: false, message: 'Gagal menghapus data.' })
  }
}

module.exports = { getOtherIncomes, createOtherIncome, deleteOtherIncome }
