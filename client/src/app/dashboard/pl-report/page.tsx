"use client"

import { useEffect, useState } from "react"
import { Lock, TrendingUp, TrendingDown, ArrowDownLeft, ArrowUpRight, FileDown, Plus, X, ChevronDown, ChevronUp } from "lucide-react"
import Link from "next/link"
import { useUser } from "@/hooks/useUser"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

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
    sponsor: { total: number; items: { sponsorName: string; tier: string; totalValue: number }[] }
    other: { total: number; items: { id: string; description: string; amount: number; date: string }[] }
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

const PIE_COLORS = ["#065f46", "#059669", "#34d399", "#6ee7b7", "#a7f3d0", "#d1fae5", "#0e7490", "#0891b2", "#38bdf8", "#7dd3fc"]

// ── Component ─────────────────────────────────────────────────────────────────
export default function PLReportPage() {
  const { isPro, loading: userLoading } = useUser()

  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState("")
  const [plData, setPlData] = useState<PLData | null>(null)
  const [loading, setLoading] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  // Other income form
  const [oiDescription, setOiDescription] = useState("")
  const [oiAmount, setOiAmount] = useState("")
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
      const contentType = res.headers.get("content-type") ?? ""
      if (contentType.includes("application/pdf")) {
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
      } else {
        const errData = await res.json().catch(() => ({}))
        alert("Gagal generate PDF: " + ((errData as Record<string, unknown>).message ?? "Server error"))
      }
    } catch (e) {
      alert("Gagal mengunduh PDF: " + (e instanceof Error ? e.message : "Unknown error"))
    } finally { setExportingPdf(false) }
  }

  const handleAddOtherIncome = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(oiAmount.replace(/[^0-9]/g, ""))
    if (!oiDescription || isNaN(amt) || amt <= 0) return
    setOiSubmitting(true)
    try {
      const res = await fetch("/api/other-income", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ eventId: selectedEventId, description: oiDescription, amount: amt }),
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

  // ── Lock UI ────────────────────────────────────────────────────────────────
  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
      </div>
    )
  }

  if (!isPro) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex items-start gap-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
            <TrendingUp className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Laporan Laba/Rugi</h1>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">PRO</span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">Laporan P&amp;L otomatis dari seluruh sumber pemasukan dan pengeluaran event.</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-slate-100">
            <Lock className="size-8 text-slate-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">Fitur Pro</p>
            <p className="mt-1 max-w-xs text-sm text-slate-500">Laporan Laba/Rugi otomatis tersedia untuk pengguna Pro. Upgrade untuk akses penuh.</p>
          </div>
          <Link href="/dashboard/upgrade" className="rounded-xl bg-emerald-800 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-900">
            Upgrade ke Pro
          </Link>
        </div>
      </div>
    )
  }

  // ── Chart data ─────────────────────────────────────────────────────────────
  const expenseChartData = plData
    ? [
        ...plData.expense.promotor.byCategory.map((c) => ({ name: c.category, value: c.total })),
        ...plData.expense.crew.byDivision.map((d) => ({ name: `Crew: ${d.division}`, value: d.total })),
      ]
    : []

  const incomeVsExpenseData = plData
    ? [
        { name: "Pemasukan", value: plData.summary.totalIncome },
        { name: "Pengeluaran", value: plData.summary.totalExpense },
      ]
    : []

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
            <TrendingUp className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Laporan Laba/Rugi</h1>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">PRO</span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">Laporan P&amp;L otomatis dari seluruh sumber pemasukan dan pengeluaran event.</p>
          </div>
        </div>
        {selectedEventId && plData && (
          <button
            onClick={handleExportPDF}
            disabled={exportingPdf}
            className="flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-900 disabled:opacity-60"
          >
            <FileDown className="size-4" />
            {exportingPdf ? "Generating..." : "Export PDF"}
          </button>
        )}
      </div>

      {/* Event Selector */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Pilih Event</label>
        <select
          value={selectedEventId}
          onChange={(e) => { setSelectedEventId(e.target.value); setPlData(null) }}
          className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
        >
          <option value="">-- Pilih event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.title}</option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex min-h-[200px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !plData && selectedEventId && (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-200 bg-white">
          <p className="text-sm text-slate-400">Tidak ada data untuk event ini.</p>
        </div>
      )}

      {plData && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-emerald-50">
                <ArrowDownLeft className="size-4 text-emerald-700" />
              </div>
              <p className="text-xs font-medium text-slate-500">Total Pemasukan</p>
              <p className="mt-1 text-lg font-bold text-emerald-800">{IDR.format(plData.summary.totalIncome)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-red-50">
                <ArrowUpRight className="size-4 text-red-600" />
              </div>
              <p className="text-xs font-medium text-slate-500">Total Pengeluaran</p>
              <p className="mt-1 text-lg font-bold text-red-600">{IDR.format(plData.summary.totalExpense)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className={`mb-3 flex size-9 items-center justify-center rounded-lg ${plData.summary.isProfit ? "bg-emerald-50" : "bg-red-50"}`}>
                {plData.summary.isProfit
                  ? <TrendingUp className="size-4 text-emerald-700" />
                  : <TrendingDown className="size-4 text-red-600" />}
              </div>
              <p className="text-xs font-medium text-slate-500">Laba/Rugi Bersih</p>
              <p className={`mt-1 text-lg font-bold ${plData.summary.isProfit ? "text-emerald-800" : "text-red-600"}`}>
                {IDR.format(plData.summary.netPL)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className={`mb-3 flex size-9 items-center justify-center rounded-lg ${plData.summary.isProfit ? "bg-emerald-50" : "bg-red-50"}`}>
                <span className={`text-xs font-bold ${plData.summary.isProfit ? "text-emerald-700" : "text-red-600"}`}>%</span>
              </div>
              <p className="text-xs font-medium text-slate-500">Margin</p>
              <p className={`mt-1 text-lg font-bold ${plData.summary.isProfit ? "text-emerald-800" : "text-red-600"}`}>
                {plData.summary.marginPct}%
              </p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Donut — expense breakdown */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-slate-900">Komposisi Pengeluaran</p>
              {expenseChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={expenseChartData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value">
                      {expenseChartData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => IDR.format(Number(v))} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-sm text-slate-400 py-8">Belum ada data pengeluaran.</p>
              )}
            </div>

            {/* Bar — income vs expense */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-slate-900">Pemasukan vs Pengeluaran</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={incomeVsExpenseData} barSize={48}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v) => IDR.format(Number(v))} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    <Cell fill="#065f46" />
                    <Cell fill="#dc2626" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Other Income Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="mb-4 text-sm font-semibold text-slate-900">Pemasukan Lain</p>
            <form onSubmit={handleAddOtherIncome} className="mb-4 flex flex-wrap gap-3">
              <input
                type="text"
                value={oiDescription}
                onChange={(e) => setOiDescription(e.target.value)}
                placeholder="Deskripsi (mis: Tiket VIP, Merchandise)"
                className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              />
              <input
                type="text"
                inputMode="numeric"
                value={oiAmount ? Number(oiAmount).toLocaleString("id-ID") : ""}
                onChange={(e) => setOiAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Nominal"
                className="w-40 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              />
              <button
                type="submit"
                disabled={oiSubmitting}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-60"
              >
                <Plus className="size-4" /> Tambah
              </button>
            </form>
            {plData.income.other.items.length === 0 ? (
              <p className="text-sm text-slate-400">Belum ada pemasukan lain.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {plData.income.other.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{item.description}</p>
                      <p className="text-xs text-slate-400">{new Date(item.date).toLocaleDateString("id-ID")}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-emerald-800">{IDR.format(item.amount)}</p>
                      <button onClick={() => handleDeleteOtherIncome(item.id)} className="text-slate-300 hover:text-red-500">
                        <X className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Detail Tables */}
          <div className="flex flex-col gap-4">

            {/* Sponsor deals */}
            <div className="rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => setShowSponsorDetail((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-4"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">Sponsor Deal</p>
                  <p className="text-xs text-slate-500">
                    {plData.income.sponsor.items.length} deal · Total {IDR.format(plData.income.sponsor.total)}
                  </p>
                </div>
                {showSponsorDetail ? <ChevronUp className="size-4 text-slate-400" /> : <ChevronDown className="size-4 text-slate-400" />}
              </button>
              {showSponsorDetail && (
                <div className="border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-5 py-3 text-left font-medium">Nama Sponsor</th>
                        <th className="px-5 py-3 text-left font-medium">Tier</th>
                        <th className="px-5 py-3 text-right font-medium">Nilai</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {plData.income.sponsor.items.length === 0 ? (
                        <tr><td colSpan={3} className="px-5 py-4 text-center text-slate-400">Tidak ada data.</td></tr>
                      ) : plData.income.sponsor.items.map((s, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-5 py-3 font-medium text-slate-900">{s.sponsorName}</td>
                          <td className="px-5 py-3 text-slate-500">{s.tier}</td>
                          <td className="px-5 py-3 text-right font-semibold text-emerald-800">{IDR.format(s.totalValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Promotor expenses */}
            <div className="rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => setShowPromoExpDetail((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-4"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">Pengeluaran Promotor</p>
                  <p className="text-xs text-slate-500">
                    {plData.expense.promotor.items.length} item · Total {IDR.format(plData.expense.promotor.total)}
                  </p>
                </div>
                {showPromoExpDetail ? <ChevronUp className="size-4 text-slate-400" /> : <ChevronDown className="size-4 text-slate-400" />}
              </button>
              {showPromoExpDetail && (
                <div className="border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-5 py-3 text-left font-medium">Deskripsi</th>
                        <th className="px-5 py-3 text-left font-medium">Kategori</th>
                        <th className="px-5 py-3 text-right font-medium">Nominal</th>
                        <th className="px-5 py-3 text-right font-medium">Tanggal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {plData.expense.promotor.items.length === 0 ? (
                        <tr><td colSpan={4} className="px-5 py-4 text-center text-slate-400">Tidak ada data.</td></tr>
                      ) : plData.expense.promotor.items.map((e, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-5 py-3 text-slate-900">{e.description}</td>
                          <td className="px-5 py-3 text-slate-500">{e.category}</td>
                          <td className="px-5 py-3 text-right font-semibold text-red-600">{IDR.format(e.amount)}</td>
                          <td className="px-5 py-3 text-right text-slate-400">{new Date(e.date).toLocaleDateString("id-ID")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Crew expenses */}
            <div className="rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => setShowCrewExpDetail((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-4"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">Pengeluaran Crew Lapangan</p>
                  <p className="text-xs text-slate-500">
                    {plData.expense.crew.items.length} transaksi · Total {IDR.format(plData.expense.crew.total)}
                  </p>
                </div>
                {showCrewExpDetail ? <ChevronUp className="size-4 text-slate-400" /> : <ChevronDown className="size-4 text-slate-400" />}
              </button>
              {showCrewExpDetail && (
                <div className="border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="px-5 py-3 text-left font-medium">Deskripsi</th>
                        <th className="px-5 py-3 text-left font-medium">Divisi</th>
                        <th className="px-5 py-3 text-right font-medium">Nominal</th>
                        <th className="px-5 py-3 text-right font-medium">Tanggal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {plData.expense.crew.items.length === 0 ? (
                        <tr><td colSpan={4} className="px-5 py-4 text-center text-slate-400">Belum ada pengeluaran lapangan.</td></tr>
                      ) : plData.expense.crew.items.map((t, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-5 py-3 text-slate-900">{t.description}</td>
                          <td className="px-5 py-3 text-slate-500">{t.division}</td>
                          <td className="px-5 py-3 text-right font-semibold text-red-600">{IDR.format(t.amount)}</td>
                          <td className="px-5 py-3 text-right text-slate-400">{new Date(t.createdAt).toLocaleDateString("id-ID")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
