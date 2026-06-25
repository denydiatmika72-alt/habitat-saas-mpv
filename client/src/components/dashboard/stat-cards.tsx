"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import { CalendarRange, Users, TrendingUp, Sparkles } from "lucide-react"

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCompact(value: number): string {
  if (value >= 1_000_000_000) {
    const v = value / 1_000_000_000
    return `Rp ${v % 1 === 0 ? v : v.toFixed(1)} M`
  }
  if (value >= 1_000_000) {
    const v = value / 1_000_000
    return `Rp ${v % 1 === 0 ? v : v.toFixed(1)} Jt`
  }
  if (value >= 1_000) {
    const v = value / 1_000
    return `Rp ${v % 1 === 0 ? v : v.toFixed(1)} Rb`
  }
  return `Rp ${value.toLocaleString("id-ID")}`
}

function formatNumber(value: number): string {
  return value.toLocaleString("id-ID")
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface EventData {
  venue_capacity?: number | string
  target_profit?: number | string
  target_sponsorship?: number | string
}

interface KPI {
  label: string
  value: string
  sub: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
      </div>
      <div className="mt-4 h-7 w-28 animate-pulse rounded-md bg-slate-100" />
      <div className="mt-2 h-4 w-36 animate-pulse rounded-md bg-slate-100" />
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function StatCards() {
  const [kpis, setKpis] = useState<KPI[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("token")
    axios
      .get('/api/events', {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        const raw = Array.isArray(res.data) ? res.data : (res.data.data ?? [])
        const events: EventData[] = raw

        const totalEvents   = events.length
        const totalCapacity = events.reduce((acc, e) => acc + Number(e.venue_capacity   ?? 0), 0)
        const totalProfit   = events.reduce((acc, e) => acc + Number(e.target_profit    ?? 0), 0)
        const totalSponsor  = events.reduce((acc, e) => acc + Number(e.target_sponsorship ?? 0), 0)

        setKpis([
          {
            label:     "Total Event",
            value:     `${totalEvents} Event`,
            sub:       totalEvents === 0 ? "Belum ada event" : `${totalEvents} event terdaftar`,
            icon:      CalendarRange,
            iconBg:    "bg-emerald-50",
            iconColor: "text-emerald-600",
          },
          {
            label:     "Total Kapasitas",
            value:     formatNumber(totalCapacity),
            sub:       "Total kapasitas venue",
            icon:      Users,
            iconBg:    "bg-sky-50",
            iconColor: "text-sky-600",
          },
          {
            label:     "Target Profit",
            value:     formatCompact(totalProfit),
            sub:       "Akumulasi target profit",
            icon:      TrendingUp,
            iconBg:    "bg-indigo-50",
            iconColor: "text-indigo-600",
          },
          {
            label:     "Target Sponsorship",
            value:     formatCompact(totalSponsor),
            sub:       "Akumulasi target sponsor",
            icon:      Sparkles,
            iconBg:    "bg-amber-50",
            iconColor: "text-amber-600",
          },
        ])
      })
      .catch((err) => {
        console.error("Gagal mengambil data events:", err)
        // Tampilkan KPI kosong saat error agar UI tetap valid
        setKpis([
          {
            label:     "Total Event",
            value:     "—",
            sub:       "Gagal memuat data",
            icon:      CalendarRange,
            iconBg:    "bg-emerald-50",
            iconColor: "text-emerald-600",
          },
          {
            label:     "Total Kapasitas",
            value:     "—",
            sub:       "Gagal memuat data",
            icon:      Users,
            iconBg:    "bg-sky-50",
            iconColor: "text-sky-600",
          },
          {
            label:     "Target Profit",
            value:     "—",
            sub:       "Gagal memuat data",
            icon:      TrendingUp,
            iconBg:    "bg-indigo-50",
            iconColor: "text-indigo-600",
          },
          {
            label:     "Target Sponsorship",
            value:     "—",
            sub:       "Gagal memuat data",
            icon:      Sparkles,
            iconBg:    "bg-amber-50",
            iconColor: "text-amber-600",
          },
        ])
      })
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <section
      aria-label="KPI Analitik Event"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {isLoading
        ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        : kpis?.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              {/* Icon + Label Row */}
              <div className="flex items-start justify-between">
                <div
                  className={`flex size-10 items-center justify-center rounded-lg ${kpi.iconBg} ${kpi.iconColor}`}
                >
                  <kpi.icon className="size-5" />
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                  Live
                </span>
              </div>

              {/* Value */}
              <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
                {kpi.value}
              </p>

              {/* Label + Sub */}
              <p className="mt-0.5 text-sm font-medium text-slate-500">{kpi.label}</p>
              <p className="mt-0.5 text-xs text-slate-400">{kpi.sub}</p>
            </div>
          ))}
    </section>
  )
}
