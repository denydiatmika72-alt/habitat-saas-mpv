const prisma = require('../src/lib/prisma');

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard Kerjasama — ringkasan per-event (read-only). SEMUA query di-scope
// promotorId (req.user.id) + eventId. Konsisten dengan fix isolasi data sponsor 2026-07-17:
// deal difilter { promotorId, eventId }; invoice di-scope via dealId milik deal-deal tsb
// (SponsorInvoice tidak punya promotorId sendiri → satu-satunya jalur aman lewat deal).
//
// Status yang dipakai (nilai DB sebenarnya):
//   SponsorDeal.status        : "Negosiasi" (→ ditampilkan "Menunggu") | "Disetujui" | "Ditolak"
//   SponsorInvoice.status     : "Belum Dibayar" | "DP Terbayar" | "Lunas"
//   SponsorDeliverable.status : "Planning" | "InProduction" | "Executed"
// Brand deliverable = SponsorDeliverable.dealId → SponsorDeal.sponsorName (tidak ada kolom brand terpisah).
// ═══════════════════════════════════════════════════════════════════════════════

// Nilai deal: pakai totalValue kalau > 0, kalau tidak jumlahkan totalPrice dealBenefits
// (pola sama dengan getDeals di sponsor.controller.js).
function dealValue(deal) {
  const tv = Number(deal.totalValue);
  if (tv > 0) return tv;
  return (deal.dealBenefits || []).reduce((s, b) => s + Number(b.totalPrice), 0);
}

const getKerjasamaDashboard = async (req, res) => {
  try {
    const promotorId = req.user.id;
    const eventId = String(req.query.eventId || '');
    if (!eventId) {
      return res.status(400).json({ success: false, message: 'eventId wajib diisi.' });
    }

    // Event harus ada & milik promotor yang login.
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, title: true, promotor_id: true, target_sponsorship: true },
    });
    if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
    if (event.promotor_id !== promotorId) {
      return res.status(403).json({ success: false, message: 'Akses ditolak — event bukan milik Anda.' });
    }

    // Deal + deliverables + nilai — di-scope ketat promotorId + eventId.
    const deals = await prisma.sponsorDeal.findMany({
      where: { promotorId, eventId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        sponsorName: true,
        status: true,
        totalValue: true,
        dealBenefits: { select: { totalPrice: true } },
        deliverables: {
          select: { title: true, status: true, category: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // ── Ringkasan Sponsor ──
    const byStatus = { menunggu: 0, disetujui: 0, ditolak: 0 };
    let totalDealValue = 0;
    let approvedDealValue = 0;
    for (const d of deals) {
      const val = dealValue(d);
      totalDealValue += val;
      if (d.status === 'Disetujui') { byStatus.disetujui += 1; approvedDealValue += val; }
      else if (d.status === 'Ditolak') { byStatus.ditolak += 1; }
      else { byStatus.menunggu += 1; } // "Negosiasi" (dan nilai lain apa pun) = menunggu
    }

    // ── Ringkasan Invoice ── (via dealId milik event+promotor ini)
    const dealIds = deals.map((d) => d.id);
    const invoices = dealIds.length
      ? await prisma.sponsorInvoice.findMany({
          where: { dealId: { in: dealIds } },
          select: { status: true, grandTotal: true },
        })
      : [];
    const invoiceSummary = {
      lunas: { count: 0, total: 0 },
      dp: { count: 0, total: 0 },
      belumDibayar: { count: 0, total: 0 },
    };
    for (const inv of invoices) {
      const amt = Number(inv.grandTotal);
      if (inv.status === 'Lunas') { invoiceSummary.lunas.count += 1; invoiceSummary.lunas.total += amt; }
      else if (inv.status === 'DP Terbayar') { invoiceSummary.dp.count += 1; invoiceSummary.dp.total += amt; }
      else { invoiceSummary.belumDibayar.count += 1; invoiceSummary.belumDibayar.total += amt; } // "Belum Dibayar"
    }

    // ── Progress Target Sponsor ── (realized = nilai deal yang sudah Disetujui)
    const targetSponsorship = Number(event.target_sponsorship) || 0;
    const realized = approvedDealValue;
    const percentage = targetSponsorship > 0 ? Math.round((realized / targetSponsorship) * 100) : 0;

    // ── Deliverables per Brand ── (satu entri per deal/brand, BUKAN angka agregat)
    const deliverablesByBrand = deals
      .filter((d) => d.deliverables.length > 0)
      .map((d) => {
        const items = d.deliverables.map((x) => ({ name: x.title, status: x.status, category: x.category }));
        const executed = items.filter((x) => x.status === 'Executed').length;
        return {
          brandName: d.sponsorName,
          dealId: d.id,
          deliverables: items,
          summaryStatus: `${executed}/${items.length} Executed`,
        };
      });

    return res.status(200).json({
      success: true,
      data: {
        event: { id: event.id, title: event.title },
        sponsorSummary: { byStatus, totalDealValue, approvedDealValue },
        invoiceSummary,
        targetProgress: { targetSponsorship, realized, percentage },
        deliverablesByBrand,
      },
    });
  } catch (error) {
    console.error('[KERJASAMA DASHBOARD ERROR]', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getKerjasamaDashboard };
