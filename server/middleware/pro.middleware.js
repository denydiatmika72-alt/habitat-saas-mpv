// ============================================================
// requireActivePro — gating fitur Pro PER-EVENT
// ------------------------------------------------------------
// Monetisasi nexEvent = Pro Per-Event (Rp 499.000 aktivasi / 90 hari, Rp 99.000 perpanjangan / +30 hari).
// Sebuah event "Pro aktif" bila PEMILIK event (promotor) punya:
//   user.plan === 'pro' && user.proEventId === <eventId> && user.proExpiresAt > now
//
// Prinsip:
// - Cek berbasis PEMILIK EVENT (bukan pemanggil) — supaya aksi crew/scanner (mis. validasi tiket,
//   catat petty cash) ikut terkunci kalau Pro promotor untuk event itu lapse. Pemanggil crew/scanner
//   tidak pernah punya Pro sendiri; yang menentukan adalah status Pro event yang mereka kerjakan.
// - Fitur LINTAS-EVENT yang tidak punya satu eventId (mis. Payout/Pencairan Dana, daftar agregat) →
//   fallback ke cek USER pemanggil (punya Pro aktif untuk event mana pun): plan==='pro' && proExpiresAt>now.
// - Gagal → 402 Payment Required (bukan 403) supaya beda jelas dari kegagalan otorisasi/ownership.
//
// Ketentuan cakupan (lihat CLAUDE.md "Pricing & Subscription Model" + known-bugs [2026-07-19]):
//   GATED (Pro): Sponsor Magic Link + katalog + invoice, Purchase Order, Expense Tracker, Field Crew +
//                Petty Cash, P&L Report, Payout, Data Audiens, Laporan Akhir Event, Gate Scanner,
//                Simulasi Harga Tiket.
//   TIDAK di-gate (Starter/gratis): RAB/Budget, Ticketing B2C/Storefront/Merch/Bundling (monetisasi via
//                komisi transaksi 1.5–3.5%, BUKAN Pro), dashboard/KPI ringkas dasar, endpoint publik
//                sponsor-portal, dan navigasi crew/scanner ("my-events") — aksi uangnya di-gate per-event.
// WAJIB dipasang SETELAH verifyToken (butuh req.user.id untuk fallback lintas-event).
// ============================================================

const prisma = require('../src/lib/prisma');

const PRO_REQUIRED_MSG = 'Fitur ini memerlukan Pro aktif untuk event ini. Upgrade di halaman pembayaran.';

function isActivePro(user, eventId) {
  if (!user) return false;
  const active = user.plan === 'pro' && user.proExpiresAt && new Date(user.proExpiresAt) > new Date();
  if (!active) return false;
  // eventId diberikan → harus event yang persis dibayar. Tanpa eventId → cukup punya Pro aktif (lintas-event).
  if (eventId) return user.proEventId === String(eventId);
  return true;
}

// ── Resolver default: eventId langsung dari request (body → query → params) ──────
async function defaultResolveEventId(req) {
  return req.body?.eventId || req.query?.eventId || req.params?.eventId || null;
}

// ── Resolver builders untuk eventId yang diturunkan dari resource :id ─────────────
const fromParam = (name) => async (req) => req.params?.[name] || null;

const fromBenefitParam = async (req) => {
  const r = await prisma.sponsorBenefit.findUnique({ where: { id: req.params.id }, select: { eventId: true } });
  return r?.eventId || null;
};
const fromPackageParam = async (req) => {
  const r = await prisma.sponsorPackage.findUnique({ where: { id: req.params.id }, select: { eventId: true } });
  return r?.eventId || null;
};
const fromDealParam = async (req) => {
  const r = await prisma.sponsorDeal.findUnique({ where: { id: req.params.id }, select: { eventId: true } });
  return r?.eventId || null;
};
const fromDealBody = async (req) => {
  if (!req.body?.dealId) return null;
  const r = await prisma.sponsorDeal.findUnique({ where: { id: req.body.dealId }, select: { eventId: true } });
  return r?.eventId || null;
};
const fromDeliverableParam = async (req) => {
  const r = await prisma.sponsorDeliverable.findUnique({
    where: { id: req.params.id },
    select: { deal: { select: { eventId: true } } },
  });
  return r?.deal?.eventId || null;
};
const fromPOParam = async (req) => {
  const r = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, select: { eventId: true } });
  return r?.eventId || null;
};
const fromExpenseParam = async (req) => {
  const r = await prisma.expense.findUnique({ where: { id: req.params.id }, select: { eventId: true } });
  return r?.eventId || null;
};
const fromCrewParam = async (req) => {
  const r = await prisma.eventCrew.findUnique({ where: { id: req.params.crewId }, select: { eventId: true } });
  return r?.eventId || null;
};
const fromInvoiceParam = async (req) => {
  const r = await prisma.sponsorInvoice.findUnique({ where: { id: req.params.id }, select: { eventId: true } });
  return r?.eventId || null;
};
const fromPettyAccountBody = async (req) => {
  if (!req.body?.accountId) return null;
  const r = await prisma.pettyCashAccount.findUnique({ where: { id: req.body.accountId }, select: { eventId: true } });
  return r?.eventId || null;
};
// Invoice generate: manual (body.eventId) atau sponsorship (body.dealId → deal.eventId).
const fromInvoiceGenerate = async (req) => {
  if (req.body?.eventId) return req.body.eventId;
  return fromDealBody(req);
};

// ── Factory ──────────────────────────────────────────────────────────────────────
// resolveEventId: async (req) => eventId | null. null → cek Pro lintas-event pemanggil.
function requireActivePro(resolveEventId = defaultResolveEventId) {
  return async (req, res, next) => {
    try {
      const eventId = await resolveEventId(req);

      if (eventId) {
        const event = await prisma.event.findUnique({
          where: { id: String(eventId) },
          select: { promotor: { select: { plan: true, proEventId: true, proExpiresAt: true } } },
        });
        if (!event) return res.status(404).json({ success: false, message: 'Event tidak ditemukan.' });
        if (!isActivePro(event.promotor, eventId)) {
          return res.status(402).json({ success: false, message: PRO_REQUIRED_MSG });
        }
      } else {
        // Lintas-event: cek Pro aktif pemanggil (punya minimal 1 event Pro aktif).
        const me = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { plan: true, proEventId: true, proExpiresAt: true },
        });
        if (!isActivePro(me, null)) {
          return res.status(402).json({ success: false, message: PRO_REQUIRED_MSG });
        }
      }

      req.activeProEventId = eventId || null;
      return next();
    } catch (err) {
      console.error('[requireActivePro ERROR]', err.message);
      return res.status(500).json({ success: false, message: 'Server error saat verifikasi status Pro.' });
    }
  };
}

module.exports = {
  requireActivePro,
  PRO_REQUIRED_MSG,
  // resolvers (dipakai route files untuk eventId turunan-resource)
  fromParam,
  fromBenefitParam,
  fromPackageParam,
  fromDealParam,
  fromDealBody,
  fromDeliverableParam,
  fromPOParam,
  fromExpenseParam,
  fromCrewParam,
  fromInvoiceParam,
  fromPettyAccountBody,
  fromInvoiceGenerate,
};
