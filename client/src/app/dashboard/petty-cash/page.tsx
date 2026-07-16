"use client"

import { useEffect, useState } from "react"
import { Lock, Wallet, Users, Trash2, ChevronDown, ChevronUp, ArrowUpCircle } from "lucide-react"
import Link from "next/link"
import { useUser } from "@/hooks/useUser"

type Event = { id: string; title: string }

type CrewMember = {
  accountId: string
  crewId: string
  name: string
  email: string
  division: string
  balance: number
  totalTopup: number
  totalExpense: number
  totalReturn: number
}

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

const getToken = () =>
  typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
})

export default function PettyCashPage() {
  const { isPro, loading: userLoading } = useUser()

  const [events, setEvents] = useState<Event[]>([])
  // Petty Cash mengelola pilihan event-nya sendiri (dropdown), TIDAK mewarisi ?eventId=
  // dari Dashboard Keuangan — konsisten dengan sifat halaman kas lintas-konteks.
  const [selectedEventId, setSelectedEventId] = useState("")
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [fetchingCrew, setFetchingCrew] = useState(false)

  // Topup state per crew (accountId → amount)
  const [topupAmounts, setTopupAmounts] = useState<Record<string, string>>({})
  const [toppingUp, setToppingUp] = useState<Record<string, boolean>>({})
  const [expandedCrew, setExpandedCrew] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch("/api/events", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.success) setEvents(data.data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedEventId || !isPro) return
    setFetchingCrew(true)
    fetch(`/api/crew?eventId=${selectedEventId}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success) {
          setCrew(data.crew)
          // Saldo/top-up expanded by default → fitur langsung terlihat tanpa klik chevron.
          // Toggle collapse manual tetap berfungsi.
          setExpandedCrew(
            Object.fromEntries((data.crew as CrewMember[]).map((c) => [c.accountId, true]))
          )
        }
      })
      .catch(() => {})
      .finally(() => setFetchingCrew(false))
  }, [selectedEventId, isPro])

  const handleTopup = async (accountId: string) => {
    const raw = topupAmounts[accountId] ?? ""
    const amt = parseFloat(raw.replace(/[^0-9]/g, ""))
    if (isNaN(amt) || amt <= 0) return
    setToppingUp((prev) => ({ ...prev, [accountId]: true }))
    try {
      const res = await fetch("/api/petty-cash/topup", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ accountId, amount: amt, description: "Top-up kas dari promotor" }),
      })
      const data = await res.json()
      if (data.success) {
        setTopupAmounts((prev) => ({ ...prev, [accountId]: "" }))
        setCrew((prev) =>
          prev.map((c) =>
            c.accountId === accountId
              ? { ...c, balance: data.balance, totalTopup: c.totalTopup + amt }
              : c
          )
        )
      }
    } finally {
      setToppingUp((prev) => ({ ...prev, [accountId]: false }))
    }
  }

  const toggleExpand = (accountId: string) => {
    setExpandedCrew((prev) => ({ ...prev, [accountId]: !prev[accountId] }))
  }

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
            <Wallet className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Petty Cash
              </h1>
              <span className="rounded-full bg-emerald-800 px-2 py-0.5 text-[10px] font-bold text-white">
                PRO
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              Pantau saldo kas lapangan crew dan lakukan top-up per divisi.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-emerald-50">
            <Lock className="size-7 text-emerald-800" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">🔒 Fitur Pro</p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
              Petty Cash tersedia untuk pengguna Pro. Upgrade untuk mengelola kas lapangan crew.
            </p>
          </div>
          <Link
            href="/dashboard/upgrade"
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900"
          >
            Upgrade ke Pro →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
          <Wallet className="size-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Petty Cash
            </h1>
            <span className="rounded-full bg-emerald-800 px-2 py-0.5 text-[10px] font-bold text-white">
              PRO
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            Pantau saldo kas lapangan crew dan lakukan top-up per divisi.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Kelola siapa saja crew di event ini lewat halaman{" "}
            <Link href="/dashboard/crew" className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900">
              Field Crew
            </Link>
            . Pengeluaran crew otomatis masuk ke Laporan P&amp;L.
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
            setCrew([])
          }}
          className="max-w-sm truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
        >
          <option value="">-- Pilih event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </select>
      </div>

      {/* No event */}
      {!selectedEventId && (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center">
          <Wallet className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm text-slate-400">Pilih event untuk melihat saldo kas crew dan melakukan top-up.</p>
        </div>
      )}

      {/* Crew balance + top-up list */}
      {selectedEventId && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="mb-4 text-sm font-semibold text-slate-900">
            Saldo Kas Crew ({crew.length})
          </p>

          {fetchingCrew ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
            </div>
          ) : crew.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Users className="size-10 text-slate-300" />
              <p className="text-sm text-slate-500">
                Belum ada crew di event ini — invite crew terlebih dahulu.
              </p>
              <Link
                href="/dashboard/crew"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-900"
              >
                Ke Halaman Field Crew →
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {crew.map((c) => (
                <li key={c.accountId} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  {/* Crew header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          {c.division}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">{c.email}</p>
                      <p className="mt-2 text-xl font-bold text-emerald-800">
                        {IDR.format(c.balance)}
                        <span className="ml-1.5 text-xs font-normal text-slate-500">saldo kas</span>
                      </p>
                    </div>
                    <button
                      onClick={() => toggleExpand(c.accountId)}
                      className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                    >
                      {expandedCrew[c.accountId] ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>
                  </div>

                  {/* Expanded: stats + topup form */}
                  {expandedCrew[c.accountId] && (
                    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Total Topup", value: c.totalTopup, color: "text-blue-600" },
                          { label: "Total Expense", value: c.totalExpense, color: "text-red-600" },
                          { label: "Total Return", value: c.totalReturn, color: "text-slate-600" },
                        ].map((s) => (
                          <div key={s.label} className="rounded-lg bg-white p-2 text-center">
                            <p className={`text-sm font-semibold ${s.color}`}>{IDR.format(s.value)}</p>
                            <p className="text-[10px] text-slate-400">{s.label}</p>
                          </div>
                        ))}
                      </div>

                      {/* Topup form */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={
                            topupAmounts[c.accountId]
                              ? Number(topupAmounts[c.accountId]).toLocaleString("id-ID")
                              : ""
                          }
                          onChange={(e) =>
                            setTopupAmounts((prev) => ({
                              ...prev,
                              [c.accountId]: e.target.value.replace(/[^0-9]/g, ""),
                            }))
                          }
                          placeholder="Nominal top-up…"
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                        />
                        <button
                          onClick={() => handleTopup(c.accountId)}
                          disabled={toppingUp[c.accountId]}
                          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                        >
                          <ArrowUpCircle className="size-4" />
                          {toppingUp[c.accountId] ? "..." : "Top-up"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
