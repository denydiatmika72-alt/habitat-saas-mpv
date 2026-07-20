"use client"

// ============================================================================
// BudgetAllocationCard — donut "Distribusi Biaya Event" (alokasi RAB).
// ----------------------------------------------------------------------------
// SEJARAH: komponen ini dulu inline di `app/dashboard/page.tsx` (bagian
// "Distribusi Biaya Event"). Saat /dashboard ditulis ulang jadi Dashboard KPI di
// commit 0842e0d, isinya ikut TERHAPUS — tidak dipindah ke mana pun. Itu regresi
// tidak disengaja, bukan keputusan desain. Dipulihkan 2026-07-21 ke Dashboard
// Perencanaan, tempat yang memang sesuai (chart ini membaca RAB).
//
// Beda dari donut di /dashboard/pl-report: yang itu "Komposisi Pengeluaran"
// (realisasi, recharts). Yang INI alokasi RAB (rencana, SVG manual). Dua chart
// berbeda — jangan digabung/dianggap duplikat.
//
// Ter-scope SATU event (prop `eventId` dari EventProvider), konsisten dgn
// keputusan 2026-07-21 bahwa data RAB tidak dicampur lintas event.
// ============================================================================

import { useEffect, useState } from "react"
import axios from "axios"

// ─── Donut geometry ───────────────────────────────────────────────────────────
const R = 56
const CX = 72
const CY = 72
const C = 2 * Math.PI * R // ≈ 351.86

interface BudgetItemData {
  estimatedCost?: number | string
}

interface BudgetCategory {
  name: string
  items?: BudgetItemData[]
}

interface ChartSegment {
  label: string
  pct: number
  color: string
  textColor: string
  dotColor: string
}

// Klasifikasi kategori RAB → 3 kelompok biaya. Heuristik berbasis nama kategori
// (kategori RAB bebas diketik promotor, tidak ada enum di DB).
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

function BudgetDonutChart({ segments }: { segments: ChartSegment[] }) {
  const SIZE = CX * 2 // 144

  let accumulated = 0
  const computed = segments.map((seg) => {
    const rotateDeg = -90 + accumulated * 3.6
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

export function BudgetAllocationCard({ eventId }: { eventId: string }) {
  const [chartSegments, setChartSegments] = useState<ChartSegment[]>(FALLBACK_SEGMENTS)
  const [loadingChart, setLoadingChart] = useState(false)

  useEffect(() => {
    if (!eventId) {
      setChartSegments(FALLBACK_SEGMENTS)
      return
    }
    const token = localStorage.getItem("token")
    setLoadingChart(true)

    axios
      .get(`/api/budgets/${eventId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const budget = res.data.budget ?? res.data.data ?? res.data
        const categories: BudgetCategory[] = budget?.categories ?? []
        const contingency = Number(budget?.contingencyFundAmount ?? 0)

        if (categories.length === 0 && contingency === 0) {
          setChartSegments(FALLBACK_SEGMENTS)
          return
        }

        // Pakai `estimatedCost` — satu-satunya nilai otoritatif yang disimpan &
        // dijumlah `recalculateBudget()`. JANGAN hitung qty × hargaSatuan: item
        // yang dibuat sebelum migrasi punya hargaSatuan = 0 (default DB) sehingga
        // biayanya jadi nol padahal estimatedCost-nya benar.
        let produksiTotal = 0
        let talentTotal = 0
        let operasionalTotal = 0

        for (const cat of categories) {
          const catTotal = (cat.items ?? []).reduce(
            (acc, item) => acc + Number(item.estimatedCost ?? 0),
            0,
          )
          const type = classifyCategory(cat.name)
          if (type === "produksi") produksiTotal += catTotal
          else if (type === "talent") talentTotal += catTotal
          else operasionalTotal += catTotal
        }

        const grandTotal = produksiTotal + talentTotal + operasionalTotal + contingency
        if (grandTotal === 0) {
          setChartSegments(FALLBACK_SEGMENTS)
          return
        }

        const raw: ChartSegment[] = [
          { label: "Produksi & Vendor", pct: Math.round((produksiTotal / grandTotal) * 100), color: "#059669", textColor: "text-emerald-600", dotColor: "bg-emerald-600" },
          { label: "Talent / Artis", pct: Math.round((talentTotal / grandTotal) * 100), color: "#6ee7b7", textColor: "text-emerald-400", dotColor: "bg-emerald-300" },
          { label: "Operasional", pct: Math.round((operasionalTotal / grandTotal) * 100), color: "#e2e8f0", textColor: "text-slate-400", dotColor: "bg-slate-200" },
          { label: "Dana Cadangan", pct: Math.round((contingency / grandTotal) * 100), color: "#fbbf24", textColor: "text-amber-500", dotColor: "bg-amber-400" },
        ].filter((s) => s.pct > 0)

        // Pembulatan per-segmen bisa membuat total ≠ 100 → koreksi di segmen terakhir.
        const total = raw.reduce((acc, s) => acc + s.pct, 0)
        if (raw.length > 0 && total !== 100) raw[raw.length - 1].pct += 100 - total

        setChartSegments(raw.length > 0 ? raw : FALLBACK_SEGMENTS)
      })
      .catch(() => setChartSegments(FALLBACK_SEGMENTS))
      .finally(() => setLoadingChart(false))
  }, [eventId])

  const produksiSeg = chartSegments.find((s) => s.label === "Produksi & Vendor")
  const isFallback = chartSegments[0]?.label === "Belum ada data RAB"

  const insightText = isFallback
    ? "📋 Belum ada data RAB untuk event ini. Buat RAB terlebih dahulu untuk melihat distribusi anggaran."
    : produksiSeg && produksiSeg.pct >= 50
      ? `💡 Anggaran Produksi mencapai ${produksiSeg.pct}%. Pastikan negosiasi vendor optimal untuk menjaga target profit Anda.`
      : "✅ Distribusi anggaran event ini terlihat seimbang. Pantau terus untuk menjaga efisiensi biaya."

  return (
    <div className="flex w-full flex-col items-center gap-8 rounded-xl border border-slate-200 bg-white p-6 md:flex-row">
      <div className="flex shrink-0 flex-col items-center gap-3">
        <BudgetDonutChart segments={chartSegments} />
        <p className="text-xs font-medium text-slate-500">Alokasi Anggaran</p>
      </div>

      <div className="hidden h-full w-px self-stretch bg-slate-100 md:block" />

      <div className="flex flex-1 flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900">
            Distribusi Biaya Event
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Berdasarkan data RAB aktual event yang sedang aktif
          </p>
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
  )
}
