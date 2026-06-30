const prisma = require('../src/lib/prisma');

const inviteCrew = async (req, res) => {
  if (req.user.role !== 'promotor')
    return res.status(403).json({ success: false, message: 'Hanya promotor yang bisa invite crew.' });

  const { email, division, eventId } = req.body;
  if (!email || !division || !eventId)
    return res.status(400).json({ success: false, message: 'email, division, dan eventId wajib diisi.' });

  try {
    // Pastikan event milik promotor ini
    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event)
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    // Cari user dengan email tersebut
    const crewUser = await prisma.user.findUnique({ where: { email } });
    if (!crewUser)
      return res.status(400).json({ success: false, message: 'User tidak ditemukan. Minta crew daftar dulu di nexeventapp.tech' });

    if (crewUser.role !== 'crew')
      return res.status(400).json({ success: false, message: 'User ini bukan crew. Pastikan crew mendaftar dengan pilihan role "crew".' });

    // Cek duplikat
    const existing = await prisma.eventCrew.findUnique({
      where: { eventId_userId: { eventId, userId: crewUser.id } },
    });
    if (existing)
      return res.status(400).json({ success: false, message: 'Crew ini sudah ditambahkan ke event.' });

    // Buat EventCrew dan PettyCashAccount sekaligus
    const [crew] = await prisma.$transaction([
      prisma.eventCrew.create({
        data: { eventId, userId: crewUser.id, division },
      }),
      prisma.pettyCashAccount.create({
        data: { eventId, userId: crewUser.id, division },
      }),
    ]);

    return res.status(201).json({
      success: true,
      crew: { id: crew.id, name: crewUser.name, email: crewUser.email, division },
    });
  } catch (err) {
    console.error('[INVITE CREW ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const getEventCrew = async (req, res) => {
  if (req.user.role !== 'promotor')
    return res.status(403).json({ success: false, message: 'Hanya promotor yang bisa melihat daftar crew.' });

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
        user: { select: { id: true, name: true, email: true } },
        transactions: { select: { type: true, amount: true } },
      },
    });

    const crew = accounts.map((acc) => {
      const topup = acc.transactions.filter(t => t.type === 'topup').reduce((s, t) => s + t.amount, 0);
      const expense = acc.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const returned = acc.transactions.filter(t => t.type === 'return').reduce((s, t) => s + t.amount, 0);
      return {
        accountId: acc.id,
        crewId: acc.userId,
        name: acc.user.name,
        email: acc.user.email,
        division: acc.division,
        balance: topup - expense - returned,
        totalTopup: topup,
        totalExpense: expense,
        totalReturn: returned,
      };
    });

    return res.status(200).json({ success: true, crew });
  } catch (err) {
    console.error('[GET EVENT CREW ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const removeCrew = async (req, res) => {
  if (req.user.role !== 'promotor')
    return res.status(403).json({ success: false, message: 'Hanya promotor yang bisa menghapus crew.' });

  const { crewId } = req.params;
  const { eventId } = req.query;
  if (!eventId)
    return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

  try {
    const event = await prisma.event.findFirst({ where: { id: eventId, promotor_id: req.user.id } });
    if (!event)
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    // Cari EventCrew record (crewId = userId crew)
    const crewRecord = await prisma.eventCrew.findUnique({
      where: { eventId_userId: { eventId, userId: crewId } },
    });
    if (!crewRecord)
      return res.status(404).json({ success: false, message: 'Crew tidak ditemukan di event ini.' });

    // Hapus EventCrew dan PettyCashAccount (cascade akan hapus transactions)
    await prisma.$transaction([
      prisma.eventCrew.delete({ where: { eventId_userId: { eventId, userId: crewId } } }),
      prisma.pettyCashAccount.deleteMany({ where: { eventId, userId: crewId } }),
    ]);

    return res.status(200).json({ success: true, message: 'Crew berhasil dihapus dari event.' });
  } catch (err) {
    if (err.code === 'P2025')
      return res.status(404).json({ success: false, message: 'Crew tidak ditemukan.' });
    console.error('[REMOVE CREW ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const getMyCrew = async (req, res) => {
  try {
    const assignments = await prisma.eventCrew.findMany({
      where: { userId: req.user.id },
      include: {
        event: { select: { id: true, title: true, event_date: true } },
      },
    });

    const result = await Promise.all(
      assignments.map(async (a) => {
        const account = await prisma.pettyCashAccount.findUnique({
          where: { eventId_userId: { eventId: a.eventId, userId: req.user.id } },
          include: { transactions: { select: { type: true, amount: true } } },
        });

        const topup = account?.transactions.filter(t => t.type === 'topup').reduce((s, t) => s + t.amount, 0) ?? 0;
        const expense = account?.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0) ?? 0;
        const returned = account?.transactions.filter(t => t.type === 'return').reduce((s, t) => s + t.amount, 0) ?? 0;

        return {
          eventId: a.eventId,
          eventTitle: a.event.title,
          eventDate: a.event.event_date,
          division: a.division,
          accountId: account?.id ?? null,
          balance: topup - expense - returned,
        };
      })
    );

    return res.status(200).json({ success: true, assignments: result });
  } catch (err) {
    console.error('[GET MY CREW ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { inviteCrew, getEventCrew, removeCrew, getMyCrew };
