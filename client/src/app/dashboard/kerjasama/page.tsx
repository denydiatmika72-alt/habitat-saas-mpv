"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSelectedEvent } from "@/contexts/event-context"
import {
  Handshake,
  ReceiptText,
  Target,
  ClipboardList,
  Package,
  CheckCircle2,
  Clock,
  XCircle,
  Building2,
} from "lucide-react"
import { ProLockPanel } from "@/components/dashboard/pro-lock"

// ── Types ────────────────────────────────────────────────────────────────────
type Event = { id: string; title: string }

type DashboardSummary = {
  event: { id: string; title: string }
  sponsorSummary: {
    byStatus: { menunggu: number; disetujui: number; ditolak: number }
    totalDealValue: number
    approvedDealValue: number
  }
  invoiceSummary: {
    lunas: { count: number; total: number }
    dp: { count: number; total: number }
    belumDibayar: { count: number; total: number }
  }
  targetProgress: { targetSponsorship: number; realized: number; percentage: number }
  deliverablesByBrand: {
    brandName: string
    dealId: string
    deliverables: { name: string; status: string; category: string }[]
    summaryStatus: string
  }[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })
const getToken = () => (typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "")
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" })

// Deliverable status → badge style + label
const DELIV_BADGE: Record<string, { cls: string; label: string }> = {
  Executed: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Executed" },
  InProduction: { cls: "bg-blue-50 text-blue-700 ring-blue-200", label: "In Production" },
  Planning: { cls: "bg-slate-100 text-slate-600 ring-slate-200", label: "Planning" },
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function KerjasamaDashboardPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">Memuat...</div>}>
      <KerjasamaDashboardInner />
    </Suspense>
  )
}

function KerjasamaDashboardInner() {
  const [events, setEvents] = useState<Event[]>([])
  // Event dari EventProvider (dipilih di Dashboard KPI). State lokal + router.replace
  // manual DIHAPUS 2026-07-20 — sinkronisasi ?eventId= kini ditangani provider.
  const { selectedEventId, setSelectedEventId } = useSelectedEvent()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(false)
  // Backend requireActivePro membalas 402 kalau event terpilih belum Pro. Tanpa penanganan khusus,
  // 402 jatuh ke empty-state generik ("Tidak ada data") → user mengira fitur kosong, bukan terkunci.
  const [proLocked, setProLocked] = useState(false)

  useEffect(() => {
    fetch("/api/events", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.success) setEvents(data.data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedEventId) { setSummary(null); setProLocked(false); return }
    setLoading(true)
    setProLocked(false)
    fetch(`/api/sponsor/dashboard-summary?eventId=${selectedEventId}`, { headers: authHeaders() })
      .then((r) => {
        if (r.status === 402) { setProLocked(true); return null }
        return r.ok ? r.json() : null
      })
      .then((data) => { setSummary(data?.success ? data.data : null) })
      .catch(() => setSummary(null))
      .finally(() => setLoading(false))
  }, [selectedEventId])

  const s = summary

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
            <Handshake className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard Kerjasama</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Ringkasan status deal sponsor, pembayaran invoice, progress target, dan deliverables per brand.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {/* eventId tidak perlu dioper manual lagi (EventProvider membawanya), tapi tetap
              disertakan supaya link ini benar juga saat dibuka di tab baru. */}
          <Link
            href={selectedEventId ? `/dashboard/sponsor?eventId=${selectedEventId}` : "/dashboard/sponsor"}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Handshake className="size-4 text-emerald-700" />
            Sponsor &amp; Partner
          </Link>
          {/* Deep-link ke sub-tab Sponsorship (mekanisme ?tab= yang sudah ada di invoice page).
              Invoice kini PER-EVENT (fix 2026-07-20) → eventId wajib terbawa. Purchase Order
              SUDAH TIDAK di halaman ini — pindah ke Dashboard Perencanaan. */}
          <Link
            href={selectedEventId ? `/dashboard/invoice?tab=sponsorship&eventId=${selectedEventId}` : "/dashboard/invoice?tab=sponsorship"}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ReceiptText className="size-4 text-emerald-700" />
            Invoice Sponsor
          </Link>
        </div>
      </div>

      {/* Event picker */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Pilih Event</label>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="max-w-sm truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
        >
          <option value="">-- Pilih event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.title}</option>
          ))}
        </select>
      </div>

      {/* Empty state */}
      {!selectedEventId && (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center">
          <Handshake className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm text-slate-400">Pilih event untuk melihat ringkasan kerjasama sponsor.</p>
        </div>
      )}

      {/* Loading */}
      {selectedEventId && loading && (
        <div className="flex justify-center py-14">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
        </div>
      )}

      {/* Terkunci Pro (backend 402) — bukan "tidak ada data" */}
      {selectedEventId && !loading && proLocked && (
        <ProLockPanel
          eventId={selectedEventId}
          featureName="Dashboard Kerjasama"
          description="Event ini belum aktif Pro. Ringkasan sponsor, invoice, target, dan deliverables khusus Pro — upgrade untuk membuka fitur ini untuk event terpilih."
        />
      )}

      {/* No data */}
      {selectedEventId && !loading && !proLocked && !s && (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center text-sm text-slate-400">
          Tidak ada data untuk event ini.
        </div>
      )}

      {s && !loading && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Card 1 — Ringkasan Sponsor */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <Handshake className="size-4 text-emerald-700" />
                <h2 className="text-sm font-semibold text-slate-900">Ringkasan Sponsor</h2>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatusTile icon={<Clock className="size-4" />} label="Menunggu" value={s.sponsorSummary.byStatus.menunggu} color="amber" />
                <StatusTile icon={<CheckCircle2 className="size-4" />} label="Disetujui" value={s.sponsorSummary.byStatus.disetujui} color="emerald" />
                <StatusTile icon={<XCircle className="size-4" />} label="Ditolak" value={s.sponsorSummary.byStatus.ditolak} color="red" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                <div>
                  <p className="text-xs text-slate-500">Total Nilai Deal</p>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">{IDR.format(s.sponsorSummary.totalDealValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Nilai Deal Disetujui</p>
                  <p className="mt-0.5 text-lg font-bold text-emerald-700">{IDR.format(s.sponsorSummary.approvedDealValue)}</p>
                </div>
              </div>
            </div>

            {/* Card 2 — Ringkasan Invoice */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <ReceiptText className="size-4 text-emerald-700" />
                <h2 className="text-sm font-semibold text-slate-900">Ringkasan Invoice</h2>
              </div>
              <ul className="space-y-2.5">
                <InvoiceRow label="Lunas" color="emerald" count={s.invoiceSummary.lunas.count} total={s.invoiceSummary.lunas.total} />
                <InvoiceRow label="DP Terbayar" color="blue" count={s.invoiceSummary.dp.count} total={s.invoiceSummary.dp.total} />
                <InvoiceRow label="Belum Dibayar" color="amber" count={s.invoiceSummary.belumDibayar.count} total={s.invoiceSummary.belumDibayar.total} />
              </ul>
            </div>
          </div>

          {/* Card 3 — Progress Target Sponsor */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <Target className="size-4 text-emerald-700" />
              <h2 className="text-sm font-semibold text-slate-900">Progress Target Sponsor</h2>
            </div>
            {s.targetProgress.targetSponsorship > 0 ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">Terealisasi (deal disetujui)</p>
                    <p className="mt-0.5 text-xl font-bold text-emerald-700">{IDR.format(s.targetProgress.realized)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Target Sponsor</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">{IDR.format(s.targetProgress.targetSponsorship)}</p>
                  </div>
                </div>
                <div className="mt-3 h-4 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${Math.min(100, s.targetProgress.percentage)}%` }}
                  />
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {s.targetProgress.percentage}% dari target tercapai
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                Target sponsor belum ditetapkan untuk event ini (Event.target_sponsorship = 0).
              </p>
            )}
          </div>

          {/* Card 4 — Deliverables per Brand */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-2">
              <ClipboardList className="size-4 text-emerald-700" />
              <h2 className="text-sm font-semibold text-slate-900">Deliverables per Brand</h2>
            </div>
            {s.deliverablesByBrand.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Package className="size-8 text-slate-300" />
                <p className="text-sm text-slate-400">
                  Belum ada deliverables. Deliverables muncul otomatis saat deal sponsor disetujui.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {s.deliverablesByBrand.map((brand) => (
                  <li key={brand.dealId} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-4 text-slate-500" />
                        <p className="text-sm font-semibold text-slate-900">{brand.brandName}</p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        {brand.summaryStatus}
                      </span>
                    </div>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {brand.deliverables.map((d, i) => {
                        const badge = DELIV_BADGE[d.status] ?? DELIV_BADGE.Planning
                        return (
                          <li
                            key={i}
                            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs ring-1 ring-inset ${badge.cls}`}
                          >
                            <span className="font-medium">{d.name}</span>
                            <span className="opacity-70">· {badge.label}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────
function StatusTile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: "amber" | "emerald" | "red" }) {
  const tone = {
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-600",
  }[color]
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3 text-center">
      <div className={`mx-auto flex size-8 items-center justify-center rounded-lg ${tone}`}>{icon}</div>
      <p className="mt-1.5 text-lg font-bold text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  )
}

function InvoiceRow({ label, color, count, total }: { label: string; color: "emerald" | "blue" | "amber"; count: number; total: number }) {
  const dot = { emerald: "bg-emerald-500", blue: "bg-blue-500", amber: "bg-amber-500" }[color]
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${dot}`} />
        <span className="text-sm text-slate-700">{label}</span>
        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{count}</span>
      </div>
      <span className="font-mono text-sm font-semibold text-slate-900">{IDR.format(total)}</span>
    </li>
  )
}
