"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { StatCards } from "@/components/dashboard/stat-cards"
import { DocumentTable } from "@/components/dashboard/document-table"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

// ─── Donut Chart Constants ────────────────────────────────────────────────────
const R  = 56
const CX = 72
const CY = 72
const C  = 2 * Math.PI * R // ≈ 351.86

const API_BASE = "/api"
const getToken = () =>
  typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` })

// ─── Types ────────────────────────────────────────────────────────────────────
interface EventItem {
  id: number | string
  title: string
}

interface BudgetItemData {
  qty?:           number | string
  hargaSatuan?:   number | string
  estimatedCost?: number | string
}

interface BudgetCategory {
  name:   string
  items?: BudgetItemData[]
}

interface ChartSegment {
  label:     string
  pct:       number
  color:     string
  textColor: string
  dotColor:  string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function classifyCategory(name: string): "produksi" | "talent" | "operasional" {
  const lower = name.toLowerCase()
  if (/produksi|vendor|sound|audio|visual|lighting|lampu|dekorasi|stage|panggung|teknis/.test(lower))
    return "produksi"
  if (/talent|artis|artist|performer|band|music|musisi|hiburan|entertain/.test(lower))
    return "talent"
  return "operasional"
}

const FALLBACK_SEGMENTS: ChartSegment[] = [
  { label: "Belum ada data RAB", pct: 100, color: "#e2e8f0", textColor: "text-slate-400", dotColor: "bg-slate-200" },
]

const DEFAULT_SEGMENTS: ChartSegment[] = [
  { label: "Produksi & Vendor", pct: 50, color: "#059669", textColor: "text-emerald-600", dotColor: "bg-emerald-600" },
  { label: "Talent / Artis",    pct: 30, color: "#6ee7b7", textColor: "text-emerald-400", dotColor: "bg-emerald-300" },
  { label: "Operasional",       pct: 20, color: "#e2e8f0", textColor: "text-slate-400",   dotColor: "bg-slate-200"  },
]

// ─── BudgetDonutChart ─────────────────────────────────────────────────────────
function BudgetDonutChart({ segments }: { segments: ChartSegment[] }) {
  const SIZE = CX * 2 // 144

  let accumulated = 0
  const computed = segments.map((seg) => {
    const rotateDeg  = -90 + accumulated * 3.6  
    const dashLength = (C * seg.pct) / 100
    accumulated += seg.pct
    return { ...seg, rotateDeg, dashLength }
  })

  const isFallback = segments.length === 1 && segments[0].color === "#e2e8f0"

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-36 h-36 shrink-0"
      aria-label="Donut chart alokasi anggaran"
    >
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f1f5f9" strokeWidth={20} />
      {computed.map((seg) => (
        <circle
          key={seg.label}
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke={seg.color}
          strokeWidth={20}
          strokeLinecap="butt"
          strokeDasharray={`${seg.dashLength.toFixed(2)} ${(C - seg.dashLength).toFixed(2)}`}
          strokeDashoffset={0}
          transform={`rotate(${seg.rotateDeg} ${CX} ${CY})`}
        />
      ))}
      <circle cx={CX} cy={CY} r={46} fill="white" />
      <text x={CX} y={CY - 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#0f172a" fontFamily="inherit">
        {isFallback ? "—" : `${computed[0]?.pct ?? 0}%`}
      </text>
      <text x={CX} y={CY + 11} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="inherit">
        {isFallback ? "No Data" : computed[0]?.label.split(" ")[0]}
      </text>
    </svg>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()
  const [events,               setEvents]               = useState<EventItem[]>([])
  const [selectedChartEventId, setSelectedChartEventId] = useState<string>("")
  const [chartSegments,        setChartSegments]        = useState<ChartSegment[]>(DEFAULT_SEGMENTS)
  const [loadingChart,         setLoadingChart]         = useState(false)

  useEffect(() => {
    axios
      .get(`${API_BASE}/events`, { headers: authHeaders() })
      .then((res) => {
        const data: EventItem[] = Array.isArray(res.data)
          ? res.data
          : (res.data.data ?? [])
        setEvents(data)
        if (data.length > 0) setSelectedChartEventId(String(data[0].id))
      })
      .catch(() => setEvents([]))
  }, [])

  useEffect(() => {
    if (!selectedChartEventId) return
    setLoadingChart(true)

    axios
      .get(`${API_BASE}/budgets/${selectedChartEventId}`, { headers: authHeaders() })
      .then((res) => {
        const budget = res.data.budget ?? res.data.data ?? res.data
        const categories: BudgetCategory[] = budget?.categories ?? []
        const contingency = Number(budget?.contingencyFundAmount ?? 0)

        if (categories.length === 0 && contingency === 0) {
          setChartSegments(FALLBACK_SEGMENTS)
          return
        }

        let produksiTotal    = 0
        let talentTotal      = 0
        let operasionalTotal = 0

        // Build per-category totals using estimatedCost — the single
        // authoritative value stored & summed by recalculateBudget().
        // We do NOT use qty * hargaSatuan here because items created
        // before the migration have hargaSatuan = 0 (DB default), which
        // would zero-out their cost even when estimatedCost is correct.
        const categoryBreakdown = categories.map((cat) => {
          const catTotal = (cat.items ?? []).reduce(
            (acc, item) => acc + Number(item.estimatedCost ?? 0),
            0
          )
          const type = classifyCategory(cat.name)
          return {
            name:      cat.name,
            type,
            total:     catTotal,
            itemCount: cat.items?.length ?? 0,
          }
        })

        // ── Debug: verify chart ↔ RAB data mapping in DevTools console ──
        console.group(`[RAB Chart] Data Mapping — eventId: ${selectedChartEventId}`)
        console.log("contingencyFundAmount:", contingency)
        console.table(
          categoryBreakdown.map((c) => ({
            Kategori:     c.name,
            Tipe:         c.type,
            "Total (Rp)": c.total,
            "Jml Item":   c.itemCount,
          }))
        )
        console.groupEnd()
        // ────────────────────────────────────────────────────────────────

        for (const { type, total } of categoryBreakdown) {
          if (type === "produksi")    produksiTotal    += total
          else if (type === "talent") talentTotal      += total
          else                        operasionalTotal += total
        }

        const grandTotal = produksiTotal + talentTotal + operasionalTotal + contingency
        if (grandTotal === 0) {
          setChartSegments(FALLBACK_SEGMENTS)
          return
        }

        const raw: ChartSegment[] = [
          { label: "Produksi & Vendor", pct: Math.round((produksiTotal    / grandTotal) * 100), color: "#059669", textColor: "text-emerald-600", dotColor: "bg-emerald-600" },
          { label: "Talent / Artis",    pct: Math.round((talentTotal      / grandTotal) * 100), color: "#6ee7b7", textColor: "text-emerald-400", dotColor: "bg-emerald-300" },
          { label: "Operasional",       pct: Math.round((operasionalTotal / grandTotal) * 100), color: "#e2e8f0", textColor: "text-slate-400",   dotColor: "bg-slate-200"   },
          { label: "Dana Cadangan",     pct: Math.round((contingency      / grandTotal) * 100), color: "#fbbf24", textColor: "text-amber-500",   dotColor: "bg-amber-400"   },
        ].filter((s) => s.pct > 0)

        const total = raw.reduce((acc, s) => acc + s.pct, 0)
        if (raw.length > 0 && total !== 100) raw[raw.length - 1].pct += 100 - total

        setChartSegments(raw.length > 0 ? raw : FALLBACK_SEGMENTS)
      })
      .catch(() => setChartSegments(FALLBACK_SEGMENTS))
      .finally(() => setLoadingChart(false))
  }, [selectedChartEventId])

  const produksiSeg = chartSegments.find((s) => s.label === "Produksi & Vendor")
  const isFallback  = chartSegments[0]?.label === "Belum ada data RAB"

  const insightText = isFallback
    ? "📋 Belum ada data RAB untuk event ini. Buat RAB terlebih dahulu untuk melihat distribusi anggaran."
    : produksiSeg && produksiSeg.pct >= 50
      ? `💡 Anggaran Produksi mencapai ${produksiSeg.pct}%. Pastikan negosiasi vendor optimal untuk menjaga target profit Anda.`
      : "✅ Distribusi anggaran event ini terlihat seimbang. Pantau terus untuk menjaga efisiensi biaya."

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-800">
            Workspace Promotor
          </p>
          <h1 className="mt-2 text-pretty text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            Pusat Kendali Finansial
          </h1>
          <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-slate-500">
            Pantau arus kas, rancang anggaran event, dan simulasikan harga tiket dalam satu platform terpadu.
          </p>
        </div>

        <div className="flex flex-wrap shrink-0 items-center gap-2">
          <Button
            variant="outline"
            className="gap-2 border-slate-200 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900 print:hidden"
            onClick={() => alert("Fitur Laporan Global Segera Hadir di V2")}
          >
            <Download className="size-4" />
            Laporan Global
          </Button>
          <Button
            className="gap-2 bg-emerald-800 text-white hover:bg-emerald-900 print:hidden"
            onClick={() => router.push("/dashboard/invoice")}
          >
            Buat Dokumen
          </Button>
        </div>
      </div>

      <StatCards />

      {/* ── Analytics Card (full-width horizontal) ───────────────────────── */}
      <div className="flex w-full flex-col items-center gap-8 rounded-xl border border-slate-200 bg-white p-6 md:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-3">
          <BudgetDonutChart segments={chartSegments} />
          <p className="text-xs font-medium text-slate-500">Alokasi Anggaran</p>
        </div>

        <div className="hidden h-full w-px self-stretch bg-slate-100 md:block" />

        <div className="flex flex-1 flex-col gap-4">
          <div className="flex w-full items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900">
                Distribusi Biaya Event
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Berdasarkan data RAB aktual per event
              </p>
            </div>
            {events.length > 0 && (
              <select
                value={selectedChartEventId}
                onChange={(e) => setSelectedChartEventId(e.target.value)}
                className="max-w-xs truncate rounded-lg border border-slate-200 bg-slate-50 p-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={String(ev.id)}>
                    {ev.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {loadingChart ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-5 animate-pulse rounded-md bg-slate-100" />
              ))}
            </div>
          ) : (
            <ul className="space-y-3">
              {chartSegments.map((seg) => (
                <li key={seg.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`inline-block h-3 w-3 rounded-full ${seg.dotColor} shrink-0`} />
                    <span className="text-sm text-slate-700">{seg.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="hidden w-24 overflow-hidden rounded-full bg-slate-100 sm:block"
                      style={{ height: 6 }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
                      />
                    </div>
                    <span className={`w-10 text-right text-sm font-semibold tabular-nums ${seg.textColor}`}>
                      {seg.pct}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs leading-relaxed text-amber-800">{insightText}</p>
          </div>
        </div>
      </div>

      <DocumentTable />
    </div>
  )
}