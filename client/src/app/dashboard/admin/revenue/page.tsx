"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { TrendingUp, Ticket, Banknote, Package, Boxes, Crown, AlertTriangle } from "lucide-react"
import { useUser } from "@/hooks/useUser"

const API_BASE = "/api"
const getToken = () => (typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "")
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` })
const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })

type PromotorRevenue = {
  promotorId: string
  promotorName: string
  promotorEmail: string
  ticketOnline: number
  ticketCashSettled: number
  merch: number
  bundling: number
  proSubscription: number
  total: number
}
type DebtPromotor = { promotorId: string; promotorName: string; promotorEmail: string; totalDebt: number; orderCount: number }
type RevenueData = {
  success: boolean
  period: { mode: string; label: string; month: number | null; year: number | null; start: string; endExclusive: string }
  totalRevenue: number
  breakdown: {
    ticketOnline: number
    ticketCashSettled: number
    merch: number
    bundling: number
    proSubscription: number
    proActivation: number
    proExtension: number
  }
  perPromotor: PromotorRevenue[]
  debt: { totalOutstanding: number; perPromotor: DebtPromotor[] }
}

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]

export default function PlatformRevenuePage() {
  const router = useRouter()
  const { user, loading: userLoading } = useUser()

  const now = new Date()
  const [mode, setMode] = useState<"month" | "custom">("month")
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const [data, setData] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userLoading && user && !user.isAdmin) router.replace("/dashboard")
  }, [user, userLoading, router])

  const fetchRevenue = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let qs = ""
      if (mode === "custom") {
        if (!startDate || !endDate) {
          setError("Isi tanggal mulai dan akhir dulu.")
          setLoading(false)
          return
        }
        qs = `?startDate=${startDate}&endDate=${endDate}`
      } else {
        qs = `?month=${month}&year=${year}`
      }
      const res = await fetch(`${API_BASE}/admin/platform-revenue/revenue${qs}`, { headers: authHeaders() })
      const json = await res.json()
      if (json.success) setData(json)
      else setError(json.message ?? "Gagal memuat data pendapatan.")
    } catch {
      setError("Gagal menghubungi server.")
    } finally {
      setLoading(false)
    }
  }, [mode, month, year, startDate, endDate])

  // Muat awal: bulan berjalan.
  useEffect(() => {
    if (!userLoading && user?.isAdmin) fetchRevenue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, user?.isAdmin])

  if (userLoading) return <div className="py-16 text-center text-sm text-slate-400">Memuat...</div>
  if (!user?.isAdmin) return null

  const b = data?.breakdown
  const sourceCards = b
    ? [
        { label: "Fee Tiket Online", value: b.ticketOnline, icon: Ticket, hint: "Midtrans auto-settle" },
        { label: "Fee Tiket Cash (Lunas)", value: b.ticketCashSettled, icon: Banknote, hint: "Ticket Box, hutang sudah dilunasi" },
        { label: "Fee Merchandise", value: b.merch, icon: Package, hint: "Online + cash lunas" },
        { label: "Fee Bundling", value: b.bundling, icon: Boxes, hint: "Online + cash lunas" },
        { label: "Langganan Pro", value: b.proSubscription, icon: Crown, hint: `Aktivasi ${IDR.format(b.proActivation)} • Perpanjangan ${IDR.format(b.proExtension)}` },
      ]
    : []

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
          <TrendingUp className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Pendapatan Platform</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Pendapatan nexEvent yang sudah benar-benar masuk rekening — fee tiket/merch/bundling + langganan Pro.
            Fee cash Ticket Box hanya dihitung setelah hutangnya dilunasi.
          </p>
        </div>
      </div>

      {/* Period picker */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 inline-flex rounded-lg border border-slate-200 p-0.5">
          <button
            onClick={() => setMode("month")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${mode === "month" ? "bg-emerald-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Bulanan
          </button>
          <button
            onClick={() => setMode("custom")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${mode === "custom" ? "bg-emerald-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Rentang Custom
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {mode === "month" ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Bulan</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Tahun</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                >
                  {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Dari Tanggal</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Sampai Tanggal</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>
            </>
          )}
          <button
            onClick={fetchRevenue}
            disabled={loading}
            className="rounded-lg bg-emerald-800 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
          >
            {loading ? "Memuat..." : "Terapkan"}
          </button>
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
      </div>

      {loading && !data ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
        </div>
      ) : data ? (
        <>
          {/* Total confirmed revenue */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
              Total Pendapatan Terkonfirmasi — {data.period.label}
            </p>
            <p className="mt-1 text-4xl font-bold text-emerald-800">{IDR.format(data.totalRevenue)}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-emerald-700/80">
              Hanya uang yang benar-benar sudah masuk rekening nexEvent (fee online + fee cash yang sudah dilunasi + langganan Pro).
            </p>
          </div>

          {/* Breakdown by source */}
          <div>
            <p className="mb-3 text-sm font-semibold text-slate-900">Rincian per Sumber</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {sourceCards.map((c) => (
                <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <c.icon className="size-4" />
                  </div>
                  <p className="text-xs font-medium text-slate-500">{c.label}</p>
                  <p className="mt-0.5 text-lg font-bold text-slate-900">{IDR.format(c.value)}</p>
                  <p className="mt-1 text-[10px] leading-tight text-slate-400">{c.hint}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Per-promotor breakdown */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="mb-4 text-sm font-semibold text-slate-900">Rincian per Promotor ({data.perPromotor.length})</p>
            {data.perPromotor.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Belum ada pendapatan pada periode ini.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Promotor</th>
                      <th className="px-2 py-2 text-right font-medium">Tiket Online</th>
                      <th className="px-2 py-2 text-right font-medium">Tiket Cash</th>
                      <th className="px-2 py-2 text-right font-medium">Merch</th>
                      <th className="px-2 py-2 text-right font-medium">Bundling</th>
                      <th className="px-2 py-2 text-right font-medium">Pro</th>
                      <th className="px-2 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.perPromotor.map((p) => (
                      <tr key={p.promotorId}>
                        <td className="px-2 py-3">
                          <p className="font-medium text-slate-900">{p.promotorName}</p>
                          <p className="text-xs text-slate-400">{p.promotorEmail}</p>
                        </td>
                        <td className="px-2 py-3 text-right text-slate-600">{IDR.format(p.ticketOnline)}</td>
                        <td className="px-2 py-3 text-right text-slate-600">{IDR.format(p.ticketCashSettled)}</td>
                        <td className="px-2 py-3 text-right text-slate-600">{IDR.format(p.merch)}</td>
                        <td className="px-2 py-3 text-right text-slate-600">{IDR.format(p.bundling)}</td>
                        <td className="px-2 py-3 text-right text-slate-600">{IDR.format(p.proSubscription)}</td>
                        <td className="px-2 py-3 text-right font-semibold text-emerald-800">{IDR.format(p.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-slate-200 font-semibold text-slate-900">
                    <tr>
                      <td className="px-2 py-3">Total</td>
                      <td className="px-2 py-3 text-right">{IDR.format(data.breakdown.ticketOnline)}</td>
                      <td className="px-2 py-3 text-right">{IDR.format(data.breakdown.ticketCashSettled)}</td>
                      <td className="px-2 py-3 text-right">{IDR.format(data.breakdown.merch)}</td>
                      <td className="px-2 py-3 text-right">{IDR.format(data.breakdown.bundling)}</td>
                      <td className="px-2 py-3 text-right">{IDR.format(data.breakdown.proSubscription)}</td>
                      <td className="px-2 py-3 text-right text-emerald-800">{IDR.format(data.totalRevenue)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Outstanding fee debt */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-5">
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" />
              <p className="text-sm font-semibold text-slate-900">Hutang Fee Belum Lunas (Seluruh Promotor)</p>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Fee cash Ticket Box yang belum disetor promotor — belum dihitung sebagai pendapatan di atas. Tidak terpengaruh periode (posisi saat ini).
            </p>
            <p className="text-2xl font-bold text-amber-700">{IDR.format(data.debt.totalOutstanding)}</p>
            {data.debt.perPromotor.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-amber-200 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Promotor</th>
                      <th className="px-2 py-2 text-right font-medium">Jml Order</th>
                      <th className="px-2 py-2 text-right font-medium">Hutang</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100/60">
                    {data.debt.perPromotor.map((d) => (
                      <tr key={d.promotorId}>
                        <td className="px-2 py-2.5">
                          <p className="font-medium text-slate-900">{d.promotorName}</p>
                          <p className="text-xs text-slate-400">{d.promotorEmail}</p>
                        </td>
                        <td className="px-2 py-2.5 text-right text-slate-600">{d.orderCount}</td>
                        <td className="px-2 py-2.5 text-right font-semibold text-amber-700">{IDR.format(d.totalDebt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
