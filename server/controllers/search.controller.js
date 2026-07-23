const prisma = require('../src/lib/prisma');

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/search?q= — pencarian global top-bar dashboard promotor.
// Read-only, TANPA schema baru, dan SELALU di-scope ke pemilik sesi (req.user.id)
// sesuai prinsip "Keamanan: Isolasi Data Per-Promotor" di CLAUDE.md — ini pencarian
// PRIBADI atas data milik promotor sendiri, bukan pencarian publik.
//
// Yang dicari (lihat placeholder "Cari dokumen, event, atau klien..."):
//   - Event       : title + location (partial match, case-insensitive).
//                   "Dokumen" (RAB/Budget) menempel 1:1 ke Event, jadi hasil event
//                   sekaligus mencakup dokumen — klik hasilnya membawa ke dashboard
//                   event tsb (RAB dicapai lewat Dashboard Perencanaan).
//   - SponsorDeal : sponsorName + contactName ("klien"). ClientAccount TIDAK ikut
//                   dicari — sponsorName-nya duplikat dari deal (1:1), jadi mencari
//                   deal sudah mencakupnya tanpa hasil dobel.
//
// Kontrak respons: { success, data: [{ type: "event"|"sponsor_deal", id, eventId,
// label, sublabel }] } — cukup untuk dropdown frontend merender & bernavigasi
// (eventId dipakai sebagai deep-link ?eventId= yang diadopsi EventProvider).
// ═══════════════════════════════════════════════════════════════════════════════

// Minimal 2 karakter — cegah query terlalu lebar pada tiap ketikan awal.
const MIN_QUERY_LENGTH = 2;
// Batas total hasil gabungan yang dikirim ke frontend.
const MAX_RESULTS = 10;

const globalSearch = async (req, res) => {
  try {
    const promotorId = req.user.id;
    const q = String(req.query.q || '').trim();

    // Query terlalu pendek → daftar kosong (bukan error) supaya frontend simpel.
    if (q.length < MIN_QUERY_LENGTH) {
      return res.json({ success: true, data: [] });
    }

    const [events, deals] = await Promise.all([
      prisma.event.findMany({
        where: {
          promotor_id: promotorId,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { location: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, title: true, location: true, event_date: true },
        orderBy: { event_date: 'desc' },
        take: MAX_RESULTS,
      }),
      prisma.sponsorDeal.findMany({
        where: {
          promotorId,
          OR: [
            { sponsorName: { contains: q, mode: 'insensitive' } },
            { contactName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          eventId: true,
          sponsorName: true,
          status: true,
          event: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_RESULTS,
      }),
    ]);

    // Event didahulukan (target navigasi utama), lalu deal sponsor; total dipangkas
    // ke MAX_RESULTS supaya dropdown tetap ringkas.
    const results = [
      ...events.map((e) => ({
        type: 'event',
        id: e.id,
        eventId: e.id,
        label: e.title,
        sublabel: e.location,
      })),
      ...deals.map((d) => ({
        type: 'sponsor_deal',
        id: d.id,
        eventId: d.eventId,
        label: d.sponsorName,
        sublabel: `Sponsor (${d.status}) · ${d.event.title}`,
      })),
    ].slice(0, MAX_RESULTS);

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('[globalSearch] Error:', error);
    res.status(500).json({ success: false, message: 'Gagal melakukan pencarian.' });
  }
};

module.exports = { globalSearch };
