const prisma = require('../src/lib/prisma');

// ============================================================================
// Ticket Price Simulation — snapshot HASIL terakhir simulasi harga tiket per-event.
// ----------------------------------------------------------------------------
// Latest-wins: satu baris per event (upsert by unique eventId). TIDAK ada history.
// Perhitungan (rumus BEP, tiering) tetap client-side di halaman Simulasi; endpoint
// ini hanya MENYIMPAN & MENGEMBALIKAN hasilnya agar Dashboard Perencanaan bisa
// menampilkan ringkasan tanpa membuka halaman Simulasi.
//
// Ownership: kepemilikan diturunkan SERVER-SIDE dari event (promotor_id), tidak
// pernah dari body. Konsisten dengan pola Expense/PO/Budget.
// ============================================================================

// Ambil angka non-negatif dari body; fallback ke default kalau bukan angka valid.
function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Persen 0..100 (dibulatkan ke integer).
function pct(value, fallback = 0) {
  const n = Math.round(num(value, fallback));
  return Math.min(100, Math.max(0, n));
}

const getSimulation = async (req, res) => {
  const { eventId } = req.query;
  if (!eventId)
    return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

  try {
    const event = await prisma.event.findFirst({
      where: { id: eventId, promotor_id: req.user.id },
    });
    if (!event)
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const simulation = await prisma.ticketPriceSimulation.findUnique({
      where: { eventId },
    });

    // Belum pernah disimulasikan → 200 dengan data null (bukan 404): frontend
    // membedakan "belum ada simulasi" (empty state) dari "event tidak ditemukan".
    return res.status(200).json({ success: true, data: simulation ?? null });
  } catch (err) {
    console.error('[GET TICKET SIMULATION ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const saveSimulation = async (req, res) => {
  const { eventId } = req.body;
  if (!eventId)
    return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });

  try {
    const event = await prisma.event.findFirst({
      where: { id: eventId, promotor_id: req.user.id },
    });
    if (!event)
      return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });

    const payload = {
      targetProfit: num(req.body.targetProfit),
      sponsorInjection: num(req.body.sponsorInjection),
      includeSponsorInPrice: Boolean(req.body.includeSponsorInPrice),
      attendance: pct(req.body.attendance),
      earlybirdAlloc: pct(req.body.earlybirdAlloc),
      presaleAlloc: pct(req.body.presaleAlloc),
      normalAlloc: pct(req.body.normalAlloc),
      capacity: Math.max(0, Math.round(num(req.body.capacity))),
      totalBudget: num(req.body.totalBudget),
      bepTickets: Math.max(0, Math.round(num(req.body.bepTickets))),
      bepRevenue: num(req.body.bepRevenue),
      priceEarlybird: num(req.body.priceEarlybird),
      pricePresale: num(req.body.pricePresale),
      priceNormal: num(req.body.priceNormal),
      projectedRevenue: num(req.body.projectedRevenue),
    };

    const simulation = await prisma.ticketPriceSimulation.upsert({
      where: { eventId },
      update: payload,
      create: { eventId, promotorId: req.user.id, ...payload },
    });

    return res.status(200).json({ success: true, data: simulation });
  } catch (err) {
    console.error('[SAVE TICKET SIMULATION ERROR]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { getSimulation, saveSimulation };
