"use client"

import { useEffect, useState } from "react"
import { Lock, Plus, Receipt, TrendingDown, X } from "lucide-react"
import Link from "next/link"
import { useUser } from "@/hooks/useUser"

type Event = { id: string; title: string }
type Expense = {
  id: string
  description: string
  amount: number
  category: string
  date: string
}

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

const CATEGORIES = ["Konsumsi", "Transportasi", "Logistik", "Operasional", "Lainnya"]

const getToken = () =>
  typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
})

export default function ExpensesPage() {
  const { isPro, loading: userLoading } = useUser()

  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState("")
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [fetchingExpenses, setFetchingExpenses] = useState(false)

  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [category, setCategory] = useState(CATEGORIES[0])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch("/api/events", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.success) setEvents(data.data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedEventId || !isPro) return
    setFetchingExpenses(true)
    fetch(`/api/expenses?eventId=${selectedEventId}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.success) setExpenses(data.data) })
      .catch(() => {})
      .finally(() => setFetchingExpenses(false))
  }, [selectedEventId, isPro])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount.replace(/[^0-9]/g, ""))
    if (!description || isNaN(amt) || amt <= 0 || !selectedEventId) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ eventId: selectedEventId, description, amount: amt, category }),
      })
      const data = await res.json()
      if (data.success) {
        setExpenses((prev) => [data.data, ...prev])
        setDescription("")
        setAmount("")
        setCategory(CATEGORIES[0])
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/expenses/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    })
    if (res.ok) setExpenses((prev) => prev.filter((e) => e.id !== id))
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
          <Receipt className="size-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Expense Tracker</h1>
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-neutral-950">
              PRO
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Catat dan pantau pengeluaran event secara real-time.
          </p>
        </div>
      </div>

      {/* Event selector */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Pilih Event</label>
        <select
          value={selectedEventId}
          onChange={(e) => {
            setSelectedEventId(e.target.value)
            setExpenses([])
          }}
          className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none"
        >
          <option value="">-- Pilih event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </select>
      </div>

      {/* No event selected placeholder */}
      {!selectedEventId && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/20 py-12 text-center">
          <TrendingDown className="mx-auto mb-3 size-10 text-neutral-600" />
          <p className="text-sm text-neutral-500">Pilih event untuk mulai mencatat pengeluaran.</p>
        </div>
      )}

      {/* Content area */}
      {selectedEventId && (
        !isPro ? (
          /* Starter lock UI */
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-10 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10">
                <Lock className="size-7 text-amber-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">🔒 Fitur Pro</p>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-neutral-400">
                  Expense Tracker tersedia untuk pengguna Pro. Upgrade ke Pro untuk mencatat
                  dan memantau pengeluaran event secara real-time.
                </p>
              </div>
              <Link
                href="/dashboard/upgrade"
                className="mt-2 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-black text-neutral-950 transition-colors hover:bg-amber-400"
              >
                Upgrade ke Pro →
              </Link>
            </div>
          </div>
        ) : (
          /* Pro content */
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Left: summary + form */}
            <div className="space-y-4 lg:col-span-2">
              {/* Summary */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
                <p className="text-xs font-medium uppercase tracking-widest text-neutral-500">
                  Total Pengeluaran
                </p>
                <p className="mt-1 text-2xl font-black text-amber-400">{IDR.format(total)}</p>
                <p className="mt-1 text-xs text-neutral-500">{expenses.length} transaksi tercatat</p>
              </div>

              {/* Form */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
                <p className="mb-4 text-sm font-semibold text-white">Catat Pengeluaran</p>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-400">
                      Deskripsi
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Contoh: Sewa sound system"
                      required
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-400">
                      Jumlah (IDR)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={amount ? Number(amount).toLocaleString("id-ID") : ""}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="0"
                      required
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-400">
                      Kategori
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-black text-neutral-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
                  >
                    <Plus className="size-4" />
                    {submitting ? "Menyimpan..." : "Catat Pengeluaran"}
                  </button>
                </form>
              </div>
            </div>

            {/* Right: feed */}
            <div className="lg:col-span-3">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
                <p className="mb-4 text-sm font-semibold text-white">Riwayat Pengeluaran</p>
                {fetchingExpenses ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                  </div>
                ) : expenses.length === 0 ? (
                  <p className="py-8 text-center text-sm text-neutral-500">
                    Belum ada pengeluaran tercatat.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {expenses.map((exp) => (
                      <li
                        key={exp.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950/50 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {exp.description}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-400">
                              {exp.category}
                            </span>
                            <span className="text-[10px] text-neutral-500">
                              {new Date(exp.date).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-sm font-bold text-amber-400">
                            {IDR.format(exp.amount)}
                          </span>
                          <button
                            onClick={() => handleDelete(exp.id)}
                            className="flex size-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-red-400"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  )
}
