"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell } from "recharts"
import {
  Ticket,
  TShirt,
  Package,
  Wallet,
  ArrowLeft,
  ChartLineUp,
  Storefront,
} from "@phosphor-icons/react/dist/ssr"

// Dashboard Tiket & Pencairan — hub (Layer 2) kategori "Tiket & Pencairan".
// Beda dari Dashboard Keuangan: halaman turunan (Manajemen Tiket & Pencairan Dana) TETAP ada di
// sidebar. Tombol di sini adalah pintu masuk TAMBAHAN, bukan pengganti.
//
// NAVIGASI — SATU PINTU PER HALAMAN DETAIL (konsolidasi 2026-07-16):
//   /dashboard/tickets  → HANYA tombol "Manajemen Tiket" di header
//   /dashboard/payout   → HANYA tombol "Pencairan Dana" di header
// Header dipilih karena SELALU ter-render; kartu/link lain hanya muncul setelah event dipilih &
// data termuat. Sebelumnya ada 2 jalan ke /dashboard/tickets dan 4 ke /dashboard/payout karena
// tombol ditambah bertahap lintas sesi tanpa cek tumpang tindih. JANGAN tambah jalan kedua.
// (Link ke /dashboard/pl-report di catatan rekonsiliasi BUKAN duplikat — tujuan berbeda, 1 jalan.)

// ── Types ──────────────────────────────────────────────────────────────────────
type Event = { id: string; title: string }

type Rollup = { count: number; revenue: number }

type SummaryData = {
  event: { id: string; title: string }
  // "net" sejak 2026-07-16 — dimungkinkan setelah migrasi fee per-kategori (fee terkunci permanen).
  basis: "net"
  orderCount: number
  tickets: Rollup
  merch: Rollup
  bundling: Rollup
  // Pajak = hak promotor, tapi bukan pendapatan kategori mana pun → dilaporkan terpisah.
  taxTotal: number
  feeTotal: number
  // tickets + merch + bundling + taxTotal === totalNet === angka P&L "Tiket & Merchandise (nexEvent)".
  totalNet: number
}

type TrendPoint = { date: string; weekEnd?: string; orderCount: number; revenue: number }

type TrendData = {
  granularity: "daily" | "weekly"
  weekOf: string | null
  range: { start: string; end: string } | null
  points: TrendPoint[]
}

type Balance = { available: number; gross: number; reserved: number }

// ── Helpers ────────────────────────────────────────────────────────────────────
const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })

const getToken = () => (typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "")
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" })

// Kunci "YYYY-MM-DD" dari server sudah dipotong menurut WIB. Parse sebagai UTC lalu format UTC juga —
// kalau dibiarkan jadi waktu lokal, browser di zona barat bisa menggeser labelnya mundur sehari.
const fmtDay = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" })

const fmtDayLong = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

// Recharts membungkus baris data kita di `.payload` dan tipenya sangat longgar (tooltip entry & bar
// entry bentuknya beda). Satu titik narrowing di sini supaya sisa komponen tetap bekerja dgn TrendPoint.
const pointOf = (entry: unknown): TrendPoint | undefined => {
  const p = (entry as { payload?: unknown } | undefined)?.payload
  return p && typeof p === "object" && "date" in p ? (p as TrendPoint) : undefined
}

// Sumbu Y ringkas: 1.2jt / 450rb — angka Rp penuh terlalu lebar untuk gutter grafik.
const compactIDR = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(".0", "")}M`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")}jt`
  if (n >= 1_000) return `${Math.round(n / 1_000)}rb`
  return String(n)
}

// ── Design tokens (selaras dgn /dashboard/pl-report) ───────────────────────────
const dsVars = {
  "--emerald": "#0F9D6D",
  "--emerald-dark": "#0B6E4F",
  "--coral": "#FF7A50",
  "--amber": "#FFC145",
  "--ink": "#2B2620",
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
  "--shadow-card": "0 8px 20px rgba(43, 38, 32, 0.08)",
  "--font-display": "var(--font-sora), sans-serif",
  "--font-body": "var(--font-space-grotesk), sans-serif",
  "--font-mono": "var(--font-jetbrains-mono), monospace",
} as React.CSSProperties

const SCOPED_CSS = `
.tkd-btn { transition: filter 120ms cubic-bezier(0.22,1,0.36,1), transform 120ms cubic-bezier(0.22,1,0.36,1), background 120ms cubic-bezier(0.22,1,0.36,1); }
.tkd-btn-solid:hover:not(:disabled) { filter: brightness(0.94); }
.tkd-btn-solid:active:not(:disabled) { transform: scale(0.97); }
.tkd-btn-secondary:hover:not(:disabled) { background: var(--surface-sunken); }
.tkd-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.tkd-nav:hover { background: var(--surface-sunken); }
.tkd-select { transition: border 120ms cubic-bezier(0.22,1,0.36,1), box-shadow 120ms cubic-bezier(0.22,1,0.36,1); }
.tkd-select:focus { border-color: var(--emerald) !important; box-shadow: 0 0 0 3px var(--emerald-tint); outline: none; }
`

const monoLabel: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }
const h2Style: React.CSSProperties = { font: "700 18px/1.25 var(--font-display)", letterSpacing: "-0.01em", color: "var(--ink)", margin: 0 }
const fieldLabel: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 6 }
const inputBase: React.CSSProperties = { width: "100%", fontFamily: "var(--font-body)", fontSize: 14, padding: "11px 14px", borderRadius: 10, border: "1.5px solid var(--line)", background: "var(--surface-card)", color: "var(--ink)", outline: "none" }

function Card({ children, padding = 18, radius = 16, style }: { children: React.ReactNode; padding?: number | string; radius?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--surface-card)", borderRadius: radius, boxShadow: "var(--shadow-card)", padding, ...style }}>
      {children}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TicketingDashboardPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">Memuat...</div>}>
      <TicketingDashboardInner />
    </Suspense>
  )
}

function TicketingDashboardInner() {
  const searchParams = useSearchParams()

  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState(searchParams.get("eventId") ?? "")
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [trend, setTrend] = useState<TrendData | null>(null)
  const [balance, setBalance] = useState<Balance | null>(null)
  const [loading, setLoading] = useState(false)
  // null = tampilan mingguan; berisi tanggal awal minggu = drill-down harian minggu tsb.
  const [drilldownWeek, setDrilldownWeek] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/events", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.success) setEvents(data.data) })
      .catch(() => {})
  }, [])

  // Saldo payout = LINTAS EVENT (payout tidak per-event) → tidak ikut selectedEventId.
  useEffect(() => {
    fetch("/api/payout/balance", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.success) setBalance({ available: data.available, gross: data.gross, reserved: data.reserved }) })
      .catch(() => {})
  }, [])

  const fetchTrend = useCallback(async (eventId: string, weekOf: string | null) => {
    const url = weekOf
      ? `/api/tickets/sales-trend?eventId=${eventId}&weekOf=${weekOf}`
      : `/api/tickets/sales-trend?eventId=${eventId}`
    const res = await fetch(url, { headers: authHeaders() })
    const data = await res.json()
    if (data.success) setTrend(data)
  }, [])

  useEffect(() => {
    if (!selectedEventId) { setSummary(null); setTrend(null); return }
    let cancelled = false
    setLoading(true)
    setDrilldownWeek(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/tickets/dashboard-summary?eventId=${selectedEventId}`, { headers: authHeaders() })
        const data = await res.json()
        if (cancelled) return
        if (data.success) setSummary(data)
        await fetchTrend(selectedEventId, null)
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [selectedEventId, fetchTrend])

  const openWeek = (weekStart: string) => {
    setDrilldownWeek(weekStart)
    fetchTrend(selectedEventId, weekStart)
  }

  const backToWeekly = () => {
    setDrilldownWeek(null)
    fetchTrend(selectedEventId, null)
  }

  // ── Shell ───────────────────────────────────────────────────────────────────
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

  const isWeekly = trend?.granularity === "weekly"
  const chartData = (trend?.points ?? []).map((p) => ({
    ...p,
    label: fmtDay(p.date),
  }))
  const hasAnySales = chartData.some((p) => p.revenue > 0 || p.orderCount > 0)

  const CARDS = summary
    ? [
        { key: "tickets", label: "Total Tiket Terjual", unit: "tiket", Icon: Ticket, tint: "var(--emerald-tint)", fg: "var(--emerald-dark)", data: summary.tickets },
        { key: "merch", label: "Total Merchandise Terjual", unit: "item", Icon: TShirt, tint: "var(--coral-tint)", fg: "var(--coral)", data: summary.merch },
        { key: "bundling", label: "Total Bundling Terjual", unit: "paket", Icon: Package, tint: "var(--amber-tint)", fg: "#8A6100", data: summary.bundling },
      ]
    : []

  return (
    <Shell>
      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ minWidth: 260 }}>
          <div style={{ ...monoLabel, marginBottom: 6 }}>Tiket &amp; Pencairan · Ringkasan</div>
          <h1 style={{ font: "800 28px/1.15 var(--font-display)", letterSpacing: "-0.02em", color: "var(--ink)", margin: "0 0 6px" }}>Dashboard Tiket &amp; Pencairan</h1>
          <p style={{ font: "400 13px/1.5 var(--font-body)", color: "var(--text-muted)", margin: 0 }}>Ringkasan penjualan real-time dan saldo pencairan Anda.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/dashboard/tickets"
            className="tkd-btn tkd-btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, padding: "10px 18px", borderRadius: 12, background: "var(--surface-card)", color: "var(--ink)", border: "1.5px solid var(--line)", textDecoration: "none" }}
          >
            <Storefront size={18} weight="duotone" color="var(--emerald-dark)" />
            Manajemen Tiket
          </Link>
          <Link
            href="/dashboard/payout"
            className="tkd-btn tkd-btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, padding: "10px 18px", borderRadius: 12, background: "var(--surface-card)", color: "var(--ink)", border: "1.5px solid var(--line)", textDecoration: "none" }}
          >
            <Wallet size={18} weight="duotone" color="var(--emerald-dark)" />
            Pencairan Dana
          </Link>
        </div>
      </div>

      {/* Saldo Payout — lintas event, tidak terpengaruh pilihan event di bawah */}
      <Card radius={16} style={{ background: "var(--ink)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Wallet size={22} weight="duotone" color="#7CC5A6" />
            </div>
            <div>
              <div style={{ ...monoLabel, color: "rgba(255,255,255,0.62)" }}>Saldo Bisa Dicairkan · Semua Event</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 26, color: "#fff", marginTop: 2 }}>
                {balance ? IDR.format(balance.available) : "—"}
              </div>
              {balance && balance.reserved > 0 && (
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "rgba(255,255,255,0.62)", marginTop: 3 }}>
                  {IDR.format(balance.reserved)} sedang diajukan/dicairkan
                </div>
              )}
            </div>
          </div>
          {/* Tombol "Lihat Detail" DIHAPUS (2026-07-16): duplikat tombol "Pencairan Dana" di header.
              Kartu ini sengaja jadi INFORMASIONAL saja — datanya tetap utuh, navigasinya satu pintu
              lewat header. Jangan tambah link ke /dashboard/payout di sini lagi. */}
        </div>
      </Card>

      {/* Event picker */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ width: "min(320px, 100%)" }}>
          <label style={fieldLabel}>Pilih Event</label>
          <span style={{ position: "relative", display: "block" }}>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="tkd-select"
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
          DATA PER {new Date().toLocaleDateString("id-ID")}
        </div>
      </div>

      {/* Belum pilih event */}
      {!selectedEventId && (
        <Card padding={0} radius={16}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "56px 24px", textAlign: "center" }}>
            <ChartLineUp size={32} weight="duotone" color="var(--text-faint)" />
            <p style={{ font: "400 13px/1.5 var(--font-body)", color: "var(--text-faint)", margin: 0 }}>Pilih event untuk melihat ringkasan penjualan.</p>
          </div>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", minHeight: 200, alignItems: "center", justifyContent: "center" }}>
          <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: "var(--emerald-dark)", borderTopColor: "transparent" }} />
        </div>
      )}

      {selectedEventId && !loading && summary && (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))", gap: 14 }}>
            {CARDS.map((c) => (
              <Card key={c.key}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: c.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <c.Icon size={18} weight="duotone" color={c.fg} />
                  </div>
                  <span style={monoLabel}>{c.label}</span>
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, color: "var(--ink)", letterSpacing: "-0.01em" }}>
                  {c.data.count.toLocaleString("id-ID")} <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-faint)" }}>{c.unit}</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, color: "var(--emerald-dark)", marginTop: 4 }}>
                  {IDR.format(c.data.revenue)}
                </div>
                {/* Label eksplisit supaya tidak ada lagi ambiguitas kotor-vs-bersih seperti versi lama. */}
                <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                  Pendapatan bersih
                </div>
              </Card>
            ))}
          </div>

          {/* Rekonsiliasi ke P&L. Sejak angka jadi net (2026-07-16) tidak ada lagi disclaimer
              "beda dari P&L" — dasarnya SUDAH sama. Baris pajak hanya muncul kalau event pakai
              pajak; tanpa itu, ketiga kartu sudah langsung sama dengan angka P&L. */}
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)", background: "var(--surface-sunken)", borderRadius: 10, padding: "10px 14px" }}>
            <strong>Pendapatan bersih</strong> dari {summary.orderCount.toLocaleString("id-ID")} pesanan berbayar — sudah dipotong fee platform.
            {summary.taxTotal > 0 && (
              <>
                {" "}Ditambah pajak terkumpul <strong>{IDR.format(summary.taxTotal)}</strong> (hak Anda sepenuhnya, bukan pendapatan kategori),
                total bersih event ini <strong>{IDR.format(summary.totalNet)}</strong>.
              </>
            )}{" "}
            Angka ini memakai dasar yang sama dengan{" "}
            <Link href={`/dashboard/pl-report?eventId=${selectedEventId}`} style={{ color: "var(--emerald-dark)", fontWeight: 600 }}>Laporan Laba/Rugi</Link>.
            {/* Kalimat "Saldo yang bisa dicairkan ada di [Pencairan Dana]" DIHAPUS (2026-07-16):
                link-nya duplikat tombol header. Link ke Laporan Laba/Rugi TETAP — tujuannya beda
                dan ini satu-satunya jalan ke sana dari halaman ini. */}
          </div>

          {/* Tren penjualan */}
          <section>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <h2 style={h2Style}>
                  {drilldownWeek ? "Penjualan Harian" : isWeekly ? "Tren Penjualan Mingguan" : "Tren Penjualan Harian"}
                </h2>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                  {drilldownWeek && trend?.range
                    ? `${fmtDayLong(trend.range.start)} – ${fmtDayLong(trend.range.end)}`
                    : isWeekly
                      ? "Rentang > 45 hari — klik salah satu bar untuk lihat rincian harian"
                      : trend?.range
                        ? `${fmtDayLong(trend.range.start)} – ${fmtDayLong(trend.range.end)}`
                        : ""}
                </div>
              </div>
              {drilldownWeek && (
                <button
                  onClick={backToWeekly}
                  className="tkd-btn tkd-btn-secondary"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 12, background: "var(--surface-card)", color: "var(--ink)", border: "1.5px solid var(--line)", cursor: "pointer" }}
                >
                  <ArrowLeft size={16} weight="bold" color="var(--emerald-dark)" />
                  Kembali ke tampilan mingguan
                </button>
              )}
            </div>

            <Card radius={16}>
              {!hasAnySales ? (
                <div style={{ display: "flex", minHeight: 220, alignItems: "center", justifyContent: "center", font: "400 13px/1.5 var(--font-body)", color: "var(--text-faint)" }}>
                  Belum ada penjualan berbayar untuk event ini.
                </div>
              ) : (
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line-soft)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "var(--text-faint)", fontFamily: "var(--font-mono)" }}
                        axisLine={{ stroke: "var(--line)" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={8}
                      />
                      <YAxis
                        tickFormatter={compactIDR}
                        tick={{ fontSize: 11, fill: "var(--text-faint)", fontFamily: "var(--font-mono)" }}
                        axisLine={false}
                        tickLine={false}
                        width={52}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--surface-sunken)" }}
                        contentStyle={{ borderRadius: 10, border: "1.5px solid var(--line)", fontFamily: "var(--font-body)", fontSize: 12, boxShadow: "var(--shadow-card)" }}
                        formatter={(value) => [IDR.format(Number(value) || 0), "Pendapatan bersih"]}
                        labelFormatter={(_label, payload) => {
                          const p = pointOf(payload?.[0])
                          if (!p) return ""
                          const when = p.weekEnd ? `${fmtDayLong(p.date)} – ${fmtDayLong(p.weekEnd)}` : fmtDayLong(p.date)
                          return `${when} · ${p.orderCount} pesanan`
                        }}
                      />
                      <Bar
                        dataKey="revenue"
                        radius={[6, 6, 0, 0]}
                        // Bar mingguan bisa diklik untuk drill-down; bar harian tidak.
                        cursor={isWeekly ? "pointer" : "default"}
                        onClick={isWeekly ? (entry) => { const p = pointOf(entry); if (p) openWeek(p.date) } : undefined}
                      >
                        {chartData.map((p) => (
                          <Cell key={p.date} fill={p.revenue > 0 ? "var(--emerald)" : "var(--line-soft)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </section>

          {/* Seksi "Kelola" DIHAPUS (2026-07-16): kedua kartunya (Manajemen Tiket & Pencairan Dana)
              cuma menduplikasi tombol header, dan seksi ini tidak memuat data apa pun — murni
              navigasi. Seksi ini juga hanya render setelah event dipilih & data termuat, sedangkan
              tombol header selalu ada; jadi header yang dipertahankan. Jangan hidupkan lagi. */}

          <div style={{ height: 8 }} />
        </>
      )}
    </Shell>
  )
}
