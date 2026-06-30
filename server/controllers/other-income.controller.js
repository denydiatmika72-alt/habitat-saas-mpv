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

const createOtherIncome = async (req, res) => {
  try {
    const userId = req.user.id
    const { eventId, description, amount, date } = req.body

    if (!eventId || !description || !amount) {
      return res.status(400).json({ success: false, message: 'eventId, description, dan amount diperlukan.' })
    }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ success: false, message: 'Amount harus lebih dari 0.' })
    }

    const item = await prisma.otherIncome.create({
      data: {
        eventId,
        userId,
        description,
        amount: amt,
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
