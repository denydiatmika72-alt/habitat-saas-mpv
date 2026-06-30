const prisma = require('../src/lib/prisma');

const getExpenses = async (req, res) => {
  const { eventId } = req.query;
  if (!eventId)
    return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

  try {
    const event = await prisma.event.findFirst({
      where: { id: eventId, promotor_id: req.user.id },
    });
    if (!event)
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const expenses = await prisma.expense.findMany({
      where: { eventId, userId: req.user.id },
      orderBy: { date: 'desc' },
    });

    return res.status(200).json({ success: true, data: expenses });
  } catch (err) {
    console.error('[GET EXPENSES ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const createExpense = async (req, res) => {
  const { eventId, description, category, receiptUrl } = req.body;
  const amount = parseFloat(req.body.amount);

  if (!eventId || !description || !category)
    return res.status(400).json({ success: false, message: 'eventId, description, dan category wajib diisi.' });

  if (isNaN(amount) || amount <= 0)
    return res.status(400).json({ success: false, message: 'amount harus berupa angka positif.' });

  try {
    const event = await prisma.event.findFirst({
      where: { id: eventId, promotor_id: req.user.id },
    });
    if (!event)
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const expense = await prisma.expense.create({
      data: {
        eventId,
        userId: req.user.id,
        description,
        amount,
        category,
        receiptUrl: receiptUrl ?? null,
      },
    });

    return res.status(201).json({ success: true, data: expense });
  } catch (err) {
    console.error('[CREATE EXPENSE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const deleteExpense = async (req, res) => {
  const { id } = req.params;

  try {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense)
      return res.status(404).json({ success: false, message: 'Pengeluaran tidak ditemukan.' });
    if (expense.userId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Tidak diizinkan.' });

    await prisma.expense.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Pengeluaran berhasil dihapus.' });
  } catch (err) {
    if (err.code === 'P2025')
      return res.status(404).json({ success: false, message: 'Pengeluaran tidak ditemukan.' });
    console.error('[DELETE EXPENSE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getExpenses, createExpense, deleteExpense };
