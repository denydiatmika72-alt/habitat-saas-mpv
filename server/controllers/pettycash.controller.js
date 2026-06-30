const prisma = require('../src/lib/prisma');

// Helper: hitung balance dari array transactions
function calcBalance(transactions) {
  const topup = transactions.filter(t => t.type === 'topup').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const returned = transactions.filter(t => t.type === 'return').reduce((s, t) => s + t.amount, 0);
  return { balance: topup - expense - returned, topup, expense, returned };
}

// POST /api/petty-cash/topup — PROMOTOR ONLY
const topupCrew = async (req, res) => {
  if (req.user.role !== 'promotor')
    return res.status(403).json({ success: false, message: 'Hanya promotor yang bisa top-up kas crew.' });

  const { accountId, amount, description } = req.body;
  if (!accountId || !description)
    return res.status(400).json({ success: false, message: 'accountId dan description wajib diisi.' });

  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0)
    return res.status(400).json({ success: false, message: 'amount harus berupa angka positif.' });

  try {
    // Pastikan account milik event yang promotor ini punya
    const account = await prisma.pettyCashAccount.findUnique({
      where: { id: accountId },
      include: {
        event: { select: { promotor_id: true } },
        transactions: { select: { type: true, amount: true } },
      },
    });
    if (!account)
      return res.status(404).json({ success: false, message: 'Akun petty cash tidak ditemukan.' });
    if (account.event.promotor_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Tidak diizinkan.' });

    const tx = await prisma.pettyCashTransaction.create({
      data: { accountId, type: 'topup', amount: amt, description, createdBy: req.user.id },
    });

    const allTx = [...account.transactions, { type: 'topup', amount: amt }];
    const { balance } = calcBalance(allTx);

    return res.status(201).json({ success: true, transaction: tx, balance });
  } catch (err) {
    console.error('[TOPUP CREW ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/petty-cash/my-account?eventId=xxx — CREW
const getMyAccount = async (req, res) => {
  const { eventId } = req.query;
  if (!eventId)
    return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

  try {
    const account = await prisma.pettyCashAccount.findUnique({
      where: { eventId_userId: { eventId, userId: req.user.id } },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
        event: { select: { title: true, event_date: true } },
      },
    });

    if (!account)
      return res.status(404).json({ success: false, message: 'Kamu tidak terdaftar di event ini.' });

    const { balance, topup, expense, returned } = calcBalance(account.transactions);

    return res.status(200).json({
      success: true,
      account: {
        id: account.id,
        division: account.division,
        eventTitle: account.event.title,
        eventDate: account.event.event_date,
      },
      balance,
      totalTopup: topup,
      totalExpense: expense,
      totalReturn: returned,
      transactions: account.transactions,
    });
  } catch (err) {
    console.error('[GET MY ACCOUNT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// POST /api/petty-cash/transaction — CREW ONLY (expense atau return)
const createTransaction = async (req, res) => {
  if (req.user.role !== 'crew')
    return res.status(403).json({ success: false, message: 'Hanya crew yang bisa mencatat transaksi ini.' });

  const { accountId, type, amount, description } = req.body;
  if (!accountId || !type || !description)
    return res.status(400).json({ success: false, message: 'accountId, type, dan description wajib diisi.' });

  if (type === 'topup')
    return res.status(400).json({ success: false, message: 'Crew tidak bisa melakukan top-up. Hubungi promotor.' });

  if (!['expense', 'return'].includes(type))
    return res.status(400).json({ success: false, message: 'type harus "expense" atau "return".' });

  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0)
    return res.status(400).json({ success: false, message: 'amount harus berupa angka positif.' });

  try {
    const account = await prisma.pettyCashAccount.findUnique({
      where: { id: accountId },
      include: { transactions: { select: { type: true, amount: true } } },
    });
    if (!account)
      return res.status(404).json({ success: false, message: 'Akun petty cash tidak ditemukan.' });
    if (account.userId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Tidak diizinkan.' });

    const { balance } = calcBalance(account.transactions);

    if (type === 'return' && amt > balance)
      return res.status(400).json({ success: false, message: `Jumlah pengembalian (${amt}) melebihi saldo saat ini (${balance}).` });

    const tx = await prisma.pettyCashTransaction.create({
      data: { accountId, type, amount: amt, description, createdBy: req.user.id },
    });

    const newBalance = type === 'expense' ? balance - amt : balance - amt;

    return res.status(201).json({ success: true, transaction: tx, balance: newBalance });
  } catch (err) {
    console.error('[CREATE TRANSACTION ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// GET /api/petty-cash/overview?eventId=xxx — PROMOTOR
const getPromoterOverview = async (req, res) => {
  if (req.user.role !== 'promotor')
    return res.status(403).json({ success: false, message: 'Hanya promotor yang bisa melihat overview.' });

  const { eventId } = req.query;
  if (!eventId)
    return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

  try {
    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event)
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const accounts = await prisma.pettyCashAccount.findMany({
      where: { eventId },
      include: {
        user: { select: { name: true, email: true } },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });

    let totalTopup = 0;
    let totalExpense = 0;
    let totalReturn = 0;

    const crewAccounts = accounts.map((acc) => {
      const { balance, topup, expense, returned } = calcBalance(acc.transactions);
      totalTopup += topup;
      totalExpense += expense;
      totalReturn += returned;

      return {
        accountId: acc.id,
        crewName: acc.user.name,
        crewEmail: acc.user.email,
        division: acc.division,
        balance,
        totalTopup: topup,
        totalExpense: expense,
        totalReturn: returned,
        lastTransaction: acc.transactions[0] ?? null,
      };
    });

    return res.status(200).json({
      success: true,
      crewAccounts,
      summary: {
        totalTopup,
        totalExpense, // HANYA ini yang masuk P&L
        totalReturn,
        netCashOut: totalTopup - totalReturn,
      },
    });
  } catch (err) {
    console.error('[GET OVERVIEW ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { topupCrew, getMyAccount, createTransaction, getPromoterOverview };
