"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useUser } from "@/hooks/useUser"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import {
  ArrowDownLeft,
  ArrowUpRight,
  TrendUp,
  Percent,
  Files,
  FilePdf,
  Plus,
  X,
  Handshake,
  Package,
  UsersThree,
  CaretDown,
  Lock,
  Wallet,
} from "@phosphor-icons/react/dist/ssr"

// ── Types ──────────────────────────────────────────────────────────────────────
type Event = { id: string; title: string }

type PLData = {
  event: { id: string; title: string; eventDate: string; location: string }
  summary: {
    totalIncome: number
    totalExpense: number
    netPL: number
    marginPct: string
    isProfit: boolean
  }
  income: {
    nexeventSales: { total: number; orderCount: number; note: string }
    sponsor: { total: number; items: { sponsorName: string; tier: string; totalValue: number }[] }
    other: {
      total: number
      byCategory: { category: string; label: string; total: number }[]
      items: { id: string; description: string; amount: number; date: string; category: string; categoryLabel: string; platform: string | null }[]
    }
  }
  expense: {
    promotor: { total: number; byCategory: { category: string; total: number }[]; items: { description: string; amount: number; category: string; date: string }[] }
    crew: { total: number; byDivision: { division: string; total: number }[]; items: { description: string; amount: number; division: string; createdAt: string }[] }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })

const getToken = () => typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" })

// Warm brand-color donut palette (design system: emerald/coral/amber family).
const DESIGN_PIE = ["#0F9D6D", "#FF7A50", "#FFC145", "#0B6E4F", "#7CC5A6", "#F2A98C", "#FFD98A", "#3B8A6E", "#C24E28", "#8A6100"]

// Jenis Pemasukan Lain (value DB → label). "tiket_platform_lain" = tiket platform EKSTERNAL input manual.
const OI_CATEGORIES = [
  { value: "merchandise", label: "Merchandise" },
  { value: "donasi", label: "Donasi/Sumbangan" },
  { value: "tiket_platform_lain", label: "Tiket Platform Lain" },
  { value: "lainnya", label: "Lainnya" },
]
// Platform tiket eksternal (selaras dgn konsep "Ticket Sales Manual Input" di CLAUDE.md).
const EXTERNAL_PLATFORMS = ["LOKET", "Tix.id", "BookMyShow", "Dewatiket", "Artatix", "Goers", "Eratix", "Snaptix", "TipTip", "Eventbrite", "Lainnya"]

// ── Design tokens (nexEvent design system) ──────────────────────────────────────
const dsVars = {
  "--emerald": "#0F9D6D",
  "--emerald-dark": "#0B6E4F",
  "--coral": "#FF7A50",
  "--amber": "#FFC145",
  "--ink": "#2B2620",
  "--ink-soft": "#6B6459",
  "--ink-faint": "#9C9488",
  "--line": "#E3DCCD",
  "--line-soft": "#EEE8DB",
  "--surface-sunken": "#F3EEE4",
  "--emerald-tint": "#E3F3EC",
  "--coral-tint": "#FFEDE6",
  "--amber-tint": "#FFF4DC",
  "--bg-page": "#FBF8F3",
  "--text-body": "#2B2620",
  "--text-muted": "#6B6459",
  "--text-faint": "#9C9488",
  "--surface-card": "#FFFFFF",
  "--status-warning": "#E09A00",
  "--status-danger": "#D64545",
  "--shadow-card": "0 8px 20px rgba(43, 38, 32, 0.08)",
  "--font-display": "var(--font-sora), sans-serif",
  "--font-body": "var(--font-space-grotesk), sans-serif",
  "--font-mono": "var(--font-jetbrains-mono), monospace",
} as React.CSSProperties

// Scoped hover/press interactions (React hoists <style>; classes are page-local).
const SCOPED_CSS = `
.plr-btn { transition: filter 120ms cubic-bezier(0.22,1,0.36,1), transform 120ms cubic-bezier(0.22,1,0.36,1), background 120ms cubic-bezier(0.22,1,0.36,1); }
.plr-btn-solid:hover:not(:disabled) { filter: brightness(0.94); }
.plr-btn-solid:active:not(:disabled) { transform: scale(0.97); }
.plr-btn-secondary:hover:not(:disabled) { background: var(--surface-sunken); }
.plr-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.plr-iconbtn:hover { background: var(--surface-sunken); }
.plr-accordion:hover { background: var(--surface-sunken); }
.plr-select, .plr-input { transition: border 120ms cubic-bezier(0.22,1,0.36,1), box-shadow 120ms cubic-bezier(0.22,1,0.36,1); }
.plr-select:focus, .plr-input:focus { border-color: var(--emerald) !important; box-shadow: 0 0 0 3px var(--emerald-tint); outline: none; }
`

// ── Small presentational helpers (design-system look) ───────────────────────────
function Card({ children, padding = 18, radius = 16, style }: { children: React.ReactNode; padding?: number | string; radius?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--surface-card)", borderRadius: radius, boxShadow: "var(--shadow-card)", padding, ...style }}>
      {children}
    </div>
  )
}

function TearLine({ notchColor = "var(--bg-page)" }: { notchColor?: string }) {
  const notch: React.CSSProperties = { position: "absolute", top: -9, width: 18, height: 18, borderRadius: "50%", background: notchColor }
  return (
    <div aria-hidden style={{ position: "relative", height: 0, borderTop: "1.5px dashed var(--line-soft)", margin: "2px 0" }}>
      <span style={{ ...notch, left: -9 }} />
      <span style={{ ...notch, right: -9 }} />
    </div>
  )
}

const BADGE_COLORS = {
  neutral: { bg: "var(--surface-sunken)", fg: "var(--text-muted)", dot: "var(--ink-faint)" },
  success: { bg: "var(--emerald-tint)", fg: "var(--emerald-dark)", dot: "var(--emerald)" },
  warning: { bg: "var(--amber-tint)", fg: "#8A6100", dot: "var(--status-warning)" },
}
function Badge({ children, status = "neutral" }: { children: React.ReactNode; status?: keyof typeof BADGE_COLORS }) {
  const c = BADGE_COLORS[status]
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500, background: c.bg, color: c.fg, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
      {children}
    </span>
  )
}

// Small mono "genre tag" chip (design Tag component).
function Tag({ children, color = "amber" }: { children: React.ReactNode; color?: "amber" | "neutral" }) {
  const c = color === "amber" ? { bg: "var(--amber)", fg: "var(--ink)" } : { bg: "var(--surface-sunken)", fg: "var(--text-muted)" }
  return (
    <span style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", background: c.bg, color: c.fg, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>
      {children}
    </span>
  )
}

const monoLabel: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }
const h2Style: React.CSSProperties = { font: "700 18px/1.25 var(--font-display)", letterSpacing: "-0.01em", color: "var(--ink)", margin: 0 }
const fieldLabel: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 6 }
const inputBase: React.CSSProperties = { width: "100%", fontFamily: "var(--font-body)", fontSize: 14, padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--surface-card)", color: "var(--ink)", outline: "none" }

// ── Component ─────────────────────────────────────────────────────────────────
export default function PLReportPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">Memuat...</div>}>
      <PLReportPageInner />
    </Suspense>
  )
}

function PLReportPageInner() {
  const { isPro, loading: userLoading } = useUser()
  const searchParams = useSearchParams()

  const [events, setEvents] = useState<Event[]>([])
  // Halaman ini adalah pintu utama kategori Keuangan: event bisa datang dari
  // query param saat user kembali dari Expense Tracker / Laporan Akhir Event.
  const [selectedEventId, setSelectedEventId] = useState(searchParams.get("eventId") ?? "")
  const [plData, setPlData] = useState<PLData | null>(null)
  const [loading, setLoading] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  // Other income form
  const [oiDescription, setOiDescription] = useState("")
  const [oiAmount, setOiAmount] = useState("")
  const [oiCategory, setOiCategory] = useState("merchandise")
  const [oiPlatform, setOiPlatform] = useState("LOKET")
  const [oiSubmitting, setOiSubmitting] = useState(false)

  // Collapsible sections
  const [showSponsorDetail, setShowSponsorDetail] = useState(false)
  const [showPromoExpDetail, setShowPromoExpDetail] = useState(false)
  const [showCrewExpDetail, setShowCrewExpDetail] = useState(false)

  useEffect(() => {
    fetch("/api/events", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.success) setEvents(data.data) })
      .catch(() => {})
  }, [])

  const fetchPLData = async (eventId: string) => {
    if (!eventId || !isPro) return
    setLoading(true)
    try {
      const res = await fetch(`/api/pl-report?eventId=${eventId}`, { headers: authHeaders() })
      const data = await res.json()
      if (data.success) setPlData(data)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (selectedEventId && isPro) fetchPLData(selectedEventId)
  }, [selectedEventId, isPro]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExportPDF = async () => {
    if (!selectedEventId) return
    setExportingPdf(true)
    try {
      const res = await fetch(`/api/pl-report/export-pdf?eventId=${selectedEventId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) {
        let message = `Server error (${res.status})`
        try {
          const errData = await res.json()
          message = (errData as Record<string, unknown>).message as string || message
        } catch { message = res.statusText || message }
        alert("Gagal generate PDF: " + message)
        return
      }
      // HTTP 200 → selalu blob — content-type header tidak reliable melalui proxy
      const blob = await res.blob()
      if (blob.size < 100) { alert("PDF kosong — coba lagi."); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `PL-Report-${selectedEventId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      alert("Gagal mengunduh PDF: " + (e instanceof Error ? e.message : "Unknown error"))
    } finally { setExportingPdf(false) }
  }

  const handleAddOtherIncome = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(oiAmount.replace(/[^0-9]/g, ""))
    if (!oiDescription || isNaN(amt) || amt <= 0) return
    // Platform hanya dikirim untuk kategori tiket platform lain.
    const platform = oiCategory === "tiket_platform_lain" ? oiPlatform : undefined
    setOiSubmitting(true)
    try {
      const res = await fetch("/api/other-income", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ eventId: selectedEventId, description: oiDescription, amount: amt, category: oiCategory, platform }),
      })
      const data = await res.json()
      if (data.success) {
        setOiDescription(""); setOiAmount("")
        fetchPLData(selectedEventId)
      }
    } catch {}
    finally { setOiSubmitting(false) }
  }

  const handleDeleteOtherIncome = async (id: string) => {
    await fetch(`/api/other-income/${id}`, { method: "DELETE", headers: authHeaders() })
    fetchPLData(selectedEventId)
  }

  // ── Page shell (warm canvas + design tokens) ─────────────────────────────────
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div
      style={{ ...dsVars, background: "var(--bg-page)", color: "var(--text-body)", fontFamily: "var(--font-body)" }}
      className="-mx-4 -mb-24 min-h-screen px-4 py-6 md:-mx-8 md:px-8 md:py-8 lg:-mb-8 lg:pb-8"
    >
      <style>{SCOPED_CSS}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
        {children}
      </div>
    </div>
  )

  const PageHeader = () => (
    <div style={{ minWidth: 260 }}>
      <div style={{ ...monoLabel, display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        Keuangan · Laporan
        <Tag color="amber">Pro</Tag>
      </div>
      <h1 style={{ font: "800 28px/1.15 var(--font-display)", letterSpacing: "-0.02em", color: "var(--ink)", margin: "0 0 6px" }}>Laporan Laba/Rugi</h1>
      <p style={{ font: "400 13px/1.5 var(--font-body)", color: "var(--text-muted)", margin: 0 }}>Laporan P&amp;L otomatis dari seluruh sumber pemasukan dan pengeluaran event.</p>
    </div>
  )

  // ── Loading (auth) ───────────────────────────────────────────────────────────
  if (userLoading) {
    return (
      <Shell>
        <div style={{ display: "flex", minHeight: "60vh", alignItems: "center", justifyContent: "center" }}>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--emerald-dark)", borderTopColor: "transparent" }} />
        </div>
      </Shell>
    )
  }

  // ── Lock UI (Starter) ────────────────────────────────────────────────────────
  if (!isPro) {
    return (
      <Shell>
        <PageHeader />
        <Card padding={0} radius={20}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "64px 24px", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: "var(--surface-sunken)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Lock size={30} weight="duotone" color="var(--text-faint)" />
            </div>
            <div>
              <p style={{ font: "700 18px/1.25 var(--font-display)", color: "var(--ink)", margin: 0 }}>Fitur Pro</p>
              <p style={{ maxWidth: 320, font: "400 13px/1.5 var(--font-body)", color: "var(--text-muted)", margin: "6px 0 0" }}>Laporan Laba/Rugi otomatis tersedia untuk pengguna Pro. Upgrade untuk akses penuh.</p>
            </div>
            <Link href="/dashboard/upgrade" className="plr-btn plr-btn-solid" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, padding: "10px 22px", borderRadius: 12, background: "var(--emerald)", color: "#fff", textDecoration: "none" }}>
              Upgrade ke Pro
            </Link>
          </div>
        </Card>
      </Shell>
    )
  }

  // ── Derived chart data ───────────────────────────────────────────────────────
  const expenseChartData = plData
    ? [
        ...plData.expense.promotor.byCategory.map((c) => ({ name: c.category, value: c.total })),
        ...plData.expense.crew.byDivision.map((d) => ({ name: `Crew: ${d.division}`, value: d.total })),
      ]
    : []

  const totalIncome = plData?.summary.totalIncome ?? 0
  const totalExpense = plData?.summary.totalExpense ?? 0
  const maxBar = Math.max(totalIncome, totalExpense, 1)
  const barInPct = Math.round((totalIncome / maxBar) * 100)
  const barOutPct = Math.round((totalExpense / maxBar) * 100)
  const topCat = expenseChartData.length ? expenseChartData.reduce((a, b) => (b.value > a.value ? b : a), expenseChartData[0]) : null
  const topCatIdx = topCat ? expenseChartData.indexOf(topCat) : -1
  const topCatPct = topCat && totalExpense > 0 ? Math.round((topCat.value / totalExpense) * 100) : 0

  // Rincian Transaksi — 3 collapsible sections mapped from plData.
  const sections = plData
    ? [
        {
          key: "sponsor",
          Icon: Handshake,
          title: "Sponsor Deal",
          sub: `${plData.income.sponsor.items.length} deal · Total ${IDR.format(plData.income.sponsor.total)}`,
          open: showSponsorDetail,
          onToggle: () => setShowSponsorDetail((v) => !v),
          empty: "Belum ada deal sponsor untuk event ini.",
          rows: plData.income.sponsor.items.map((s) => ({ name: s.sponsorName, meta: s.tier, badge: s.tier, amount: IDR.format(s.totalValue) })),
        },
        {
          key: "promotor",
          Icon: Package,
          title: "Pengeluaran Promotor",
          sub: `${plData.expense.promotor.items.length} item · Total ${IDR.format(plData.expense.promotor.total)}`,
          open: showPromoExpDetail,
          onToggle: () => setShowPromoExpDetail((v) => !v),
          empty: "Belum ada pengeluaran promotor.",
          rows: plData.expense.promotor.items.map((e) => ({ name: e.description, meta: new Date(e.date).toLocaleDateString("id-ID"), badge: e.category, amount: IDR.format(e.amount) })),
        },
        {
          key: "crew",
          Icon: UsersThree,
          title: "Pengeluaran Crew Lapangan",
          sub: `${plData.expense.crew.items.length} transaksi · Total ${IDR.format(plData.expense.crew.total)}`,
          open: showCrewExpDetail,
          onToggle: () => setShowCrewExpDetail((v) => !v),
          empty: "Belum ada transaksi crew lapangan.",
          rows: plData.expense.crew.items.map((t) => ({ name: t.description, meta: new Date(t.createdAt).toLocaleDateString("id-ID"), badge: t.division, amount: IDR.format(t.amount) })),
        },
      ]
    : []

  const heroIsProfit = plData?.summary.isProfit ?? true

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Shell>

      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", justifyContent: "space-between" }}>
        <PageHeader />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {/* Halaman turunan kategori Keuangan mewarisi event lewat query param. */}
          {selectedEventId && (
            <>
              <Link
                href={`/dashboard/expenses?eventId=${selectedEventId}`}
                className="plr-btn plr-btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, padding: "10px 18px", borderRadius: 12, background: "var(--surface-card)", color: "var(--ink)", border: "1.5px solid var(--line)", textDecoration: "none" }}
              >
                <Wallet size={18} weight="duotone" color="var(--emerald-dark)" />
                Expense Tracker
              </Link>
              <Link
                href={`/dashboard/event-summary?eventId=${selectedEventId}`}
                className="plr-btn plr-btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, padding: "10px 18px", borderRadius: 12, background: "var(--surface-card)", color: "var(--ink)", border: "1.5px solid var(--line)", textDecoration: "none" }}
              >
                <Files size={18} weight="duotone" color="var(--emerald-dark)" />
                Laporan Akhir Event
              </Link>
            </>
          )}
          {selectedEventId && plData && (
            <button
              onClick={handleExportPDF}
              disabled={exportingPdf}
              className="plr-btn plr-btn-solid"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, padding: "10px 18px", borderRadius: 12, background: "var(--coral)", color: "#fff", border: "none", cursor: "pointer" }}
            >
              <FilePdf size={18} weight="duotone" color="#fff" />
              {exportingPdf ? "Generating..." : "Export PDF"}
            </button>
          )}
        </div>
      </div>

      {/* Event picker */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ width: "min(320px, 100%)" }}>
          <label style={fieldLabel}>Pilih Event</label>
          <span style={{ position: "relative", display: "block" }}>
            <select
              value={selectedEventId}
              onChange={(e) => { setSelectedEventId(e.target.value); setPlData(null) }}
              className="plr-select"
              style={{ ...inputBase, appearance: "none", WebkitAppearance: "none", padding: "11px 36px 11px 14px", cursor: "pointer" }}
            >
              <option value="">-- Pilih event --</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>{ev.title}</option>
              ))}
            </select>
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--emerald-dark)", fontSize: 11 }}>▾</span>
          </span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", letterSpacing: "0.05em" }}>
          LAPORAN PER {new Date().toLocaleDateString("id-ID")}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", minHeight: 200, alignItems: "center", justifyContent: "center" }}>
          <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: "var(--emerald-dark)", borderTopColor: "transparent" }} />
        </div>
      )}

      {/* Empty state */}
      {!loading && !plData && selectedEventId && (
        <Card padding={0} radius={16}>
          <div style={{ display: "flex", minHeight: 200, alignItems: "center", justifyContent: "center", font: "400 13px/1.5 var(--font-body)", color: "var(--text-faint)" }}>
            Tidak ada data untuk event ini.
          </div>
        </Card>
      )}

      {plData && !loading && (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))", gap: 14 }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--emerald-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ArrowDownLeft size={18} weight="duotone" color="var(--emerald-dark)" />
                </div>
                <span style={monoLabel}>Total Pemasukan</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.01em", color: "var(--emerald-dark)" }}>{IDR.format(plData.summary.totalIncome)}</div>
            </Card>

            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--coral-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ArrowUpRight size={18} weight="duotone" color="var(--status-danger)" />
                </div>
                <span style={monoLabel}>Total Pengeluaran</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.01em", color: "var(--status-danger)" }}>{IDR.format(plData.summary.totalExpense)}</div>
            </Card>

            {/* Hero — Laba/Rugi Bersih (dark emerald surface) */}
            <Card style={{ background: "var(--emerald-dark)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <TrendUp size={18} weight="duotone" color="#FFFFFF" />
                </div>
                <span style={{ ...monoLabel, color: "rgba(255,255,255,0.68)" }}>Laba/Rugi Bersih</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.01em", color: heroIsProfit ? "#FFFFFF" : "var(--amber)" }}>{IDR.format(plData.summary.netPL)}</div>
              <div style={{ font: "400 12px/1.5 var(--font-body)", color: "rgba(255,255,255,0.68)", marginTop: 4 }}>{heroIsProfit ? "Event ini untung" : "Event ini rugi"}</div>
            </Card>

            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--amber-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Percent size={18} weight="duotone" color="var(--status-warning)" />
                </div>
                <span style={monoLabel}>Margin</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 24, letterSpacing: "-0.01em", color: heroIsProfit ? "var(--ink)" : "var(--status-danger)" }}>{plData.summary.marginPct}%</div>
            </Card>
          </div>

          <TearLine />

          {/* Sumber Pemasukan */}
          <section>
            <h2 style={{ ...h2Style, marginBottom: 12 }}>Sumber Pemasukan</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
              <Card style={{ background: "var(--emerald-tint)", boxShadow: "none" }}>
                <div style={{ ...monoLabel, color: "var(--emerald-dark)", marginBottom: 10 }}>Tiket &amp; Merchandise (nexEvent)</div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 20, color: "var(--emerald-dark)" }}>{IDR.format(plData.income.nexeventSales.total)}</div>
                <div style={{ font: "400 12px/1.5 var(--font-body)", color: "var(--emerald-dark)", opacity: 0.8, marginTop: 5 }}>{plData.income.nexeventSales.orderCount} transaksi · net setelah fee platform</div>
              </Card>
              <Card>
                <div style={{ ...monoLabel, marginBottom: 10 }}>Sponsor Deal</div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 20, color: "var(--ink)" }}>{IDR.format(plData.income.sponsor.total)}</div>
                <div style={{ font: "400 12px/1.5 var(--font-body)", color: "var(--text-muted)", marginTop: 5 }}>{plData.income.sponsor.items.length} deal (DP/Lunas)</div>
              </Card>
              <Card>
                <div style={{ ...monoLabel, marginBottom: 10 }}>Pemasukan Lain</div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 20, color: "var(--ink)" }}>{IDR.format(plData.income.other.total)}</div>
                <div style={{ font: "400 12px/1.5 var(--font-body)", color: "var(--text-muted)", marginTop: 5 }}>
                  {plData.income.other.byCategory.length > 0 ? plData.income.other.byCategory.map((c) => c.label).join(" · ") : "Belum ada catatan"}
                </div>
              </Card>
            </div>
          </section>

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
            {/* Komposisi Pengeluaran — recharts donut */}
            <Card padding={22} radius={20}>
              <h2 style={{ ...h2Style, marginBottom: 16 }}>Komposisi Pengeluaran</h2>
              {expenseChartData.length > 0 ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, flexWrap: "wrap", padding: "6px 0 12px" }}>
                    <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                      <PieChart width={160} height={160}>
                        <Pie data={expenseChartData} cx="50%" cy="50%" innerRadius={40} outerRadius={76} paddingAngle={2.5} dataKey="value" stroke="none">
                          {expenseChartData.map((_, i) => (
                            <Cell key={i} fill={DESIGN_PIE[i % DESIGN_PIE.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => IDR.format(Number(v))} />
                      </PieChart>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140 }}>
                      {expenseChartData.map((d, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: DESIGN_PIE[i % DESIGN_PIE.length], flexShrink: 0 }} />
                          <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--ink)" }}>{d.name}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", marginLeft: "auto", paddingLeft: 12 }}>
                            {totalExpense > 0 ? Math.round((d.value / totalExpense) * 100) : 0}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {topCat && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--surface-sunken)", borderRadius: 12 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: DESIGN_PIE[topCatIdx % DESIGN_PIE.length], flexShrink: 0 }} />
                      <span style={{ font: "500 13px/1.5 var(--font-body)" }}>Terbesar: <strong>{topCat.name}</strong></span>
                      <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, color: "var(--emerald-dark)" }}>{topCatPct}% dari total</span>
                    </div>
                  )}
                </>
              ) : (
                <p style={{ textAlign: "center", font: "400 13px/1.5 var(--font-body)", color: "var(--text-faint)", padding: "32px 0" }}>Belum ada data pengeluaran.</p>
              )}
            </Card>

            {/* Pemasukan vs Pengeluaran — progress bars + selisih */}
            <Card padding={22} radius={20}>
              <h2 style={{ ...h2Style, marginBottom: 18 }}>Pemasukan vs Pengeluaran</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                    <span style={{ font: "500 13px/1.5 var(--font-body)" }}>Pemasukan</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{IDR.format(totalIncome)}</span>
                  </div>
                  <div style={{ height: 24, background: "var(--surface-sunken)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${barInPct}%`, background: "var(--emerald)", borderRadius: 999, transition: "width 200ms cubic-bezier(0.22,1,0.36,1)" }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                    <span style={{ font: "500 13px/1.5 var(--font-body)" }}>Pengeluaran</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, color: "var(--status-danger)" }}>{IDR.format(totalExpense)}</span>
                  </div>
                  <div style={{ height: 24, background: "var(--surface-sunken)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${barOutPct}%`, background: "var(--status-danger)", borderRadius: 999, transition: "width 200ms cubic-bezier(0.22,1,0.36,1)" }} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 2 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>Selisih</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, color: heroIsProfit ? "var(--emerald-dark)" : "var(--status-danger)" }}>
                    {heroIsProfit ? "+" : "−"}{IDR.format(Math.abs(plData.summary.netPL))}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          {/* Pemasukan Lain */}
          <Card padding={22} radius={20}>
            <h2 style={{ ...h2Style, marginBottom: 4 }}>Pemasukan Lain</h2>
            <p style={{ font: "400 13px/1.5 var(--font-body)", color: "var(--text-muted)", margin: "0 0 16px" }}>Catat merchandise, donasi, atau tiket dari platform lain (mis. LOKET/Tix.id). Penjualan tiket via nexEvent sudah dihitung otomatis di atas.</p>
            <form onSubmit={handleAddOtherIncome} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 6 }}>
              <div style={{ width: 180, flexShrink: 0 }}>
                <label style={fieldLabel}>Kategori</label>
                <span style={{ position: "relative", display: "block" }}>
                  <select
                    value={oiCategory}
                    onChange={(e) => setOiCategory(e.target.value)}
                    className="plr-select"
                    style={{ ...inputBase, appearance: "none", WebkitAppearance: "none", padding: "11px 36px 11px 14px", cursor: "pointer" }}
                  >
                    {OI_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--emerald-dark)", fontSize: 11 }}>▾</span>
                </span>
              </div>
              {oiCategory === "tiket_platform_lain" && (
                <div style={{ width: 160, flexShrink: 0 }}>
                  <label style={fieldLabel}>Platform</label>
                  <span style={{ position: "relative", display: "block" }}>
                    <select
                      value={oiPlatform}
                      onChange={(e) => setOiPlatform(e.target.value)}
                      className="plr-select"
                      style={{ ...inputBase, appearance: "none", WebkitAppearance: "none", padding: "11px 36px 11px 14px", cursor: "pointer" }}
                    >
                      {EXTERNAL_PLATFORMS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--emerald-dark)", fontSize: 11 }}>▾</span>
                  </span>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={fieldLabel}>Deskripsi</label>
                <input
                  type="text"
                  value={oiDescription}
                  onChange={(e) => setOiDescription(e.target.value)}
                  placeholder="mis. Kaos band, Donasi komunitas"
                  className="plr-input"
                  style={inputBase}
                />
              </div>
              <div style={{ width: 150, flexShrink: 0 }}>
                <label style={fieldLabel}>Nominal</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={oiAmount ? Number(oiAmount).toLocaleString("id-ID") : ""}
                  onChange={(e) => setOiAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="5.000.000"
                  className="plr-input"
                  style={{ ...inputBase, fontFamily: "var(--font-mono)" }}
                />
              </div>
              <button
                type="submit"
                disabled={oiSubmitting}
                className="plr-btn plr-btn-solid"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, padding: "11px 18px", borderRadius: 12, background: "var(--emerald)", color: "#fff", border: "none", cursor: "pointer" }}
              >
                <Plus size={16} weight="bold" color="#fff" /> Tambah
              </button>
            </form>
            {plData.income.other.items.length === 0 ? (
              <div style={{ font: "400 13px/1.5 var(--font-body)", color: "var(--text-faint)", padding: "14px 0", borderTop: "1px solid var(--line-soft)" }}>Belum ada pemasukan lain yang dicatat.</div>
            ) : (
              plData.income.other.items.map((item) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: "1px solid var(--line-soft)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{item.description}</span>
                      <Tag color={item.category === "tiket_platform_lain" ? "amber" : "neutral"}>
                        {item.category === "tiket_platform_lain" && item.platform ? `Tiket Platform Lain — ${item.platform}` : item.categoryLabel}
                      </Tag>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>{new Date(item.date).toLocaleDateString("id-ID")}</div>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, color: "var(--emerald-dark)" }}>{IDR.format(item.amount)}</span>
                  <button
                    onClick={() => handleDeleteOtherIncome(item.id)}
                    aria-label="Hapus"
                    className="plr-iconbtn"
                    style={{ width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 10, border: "none", background: "transparent", cursor: "pointer" }}
                  >
                    <X size={16} weight="bold" color="var(--text-faint)" />
                  </button>
                </div>
              ))
            )}
          </Card>

          {/* Rincian Transaksi */}
          <section>
            <h2 style={{ ...h2Style, marginBottom: 12 }}>Rincian Transaksi</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {sections.map((sec) => (
                <Card key={sec.key} padding={0} radius={16}>
                  <button
                    onClick={sec.onToggle}
                    className="plr-accordion"
                    style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "16px 20px", background: "transparent", border: "none", borderRadius: 16, cursor: "pointer", textAlign: "left", fontFamily: "var(--font-body)" }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--emerald-tint)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <sec.Icon size={18} weight="duotone" color="var(--emerald-dark)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>{sec.title}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{sec.sub}</div>
                    </div>
                    <div style={{ transform: sec.open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 160ms cubic-bezier(0.22,1,0.36,1)" }}>
                      <CaretDown size={16} weight="bold" color="var(--text-faint)" />
                    </div>
                  </button>
                  {sec.open && (
                    <div style={{ padding: "0 20px 6px" }}>
                      <TearLine notchColor="var(--surface-card)" />
                      {sec.rows.length === 0 ? (
                        <div style={{ font: "400 13px/1.5 var(--font-body)", color: "var(--text-faint)", padding: "14px 0" }}>{sec.empty}</div>
                      ) : (
                        sec.rows.map((row, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderTop: "1px solid var(--line-soft)" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{row.name}</div>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>{row.meta}</div>
                            </div>
                            {row.badge ? <Badge status="neutral">{row.badge}</Badge> : null}
                            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, minWidth: 110, textAlign: "right", color: sec.key === "sponsor" ? "var(--emerald-dark)" : "var(--status-danger)" }}>{row.amount}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>

          <div style={{ height: 8 }} />
        </>
      )}
    </Shell>
  )
}
