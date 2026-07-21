"use client"

import { Suspense, useEffect, useState } from "react"
import { ArrowLeft, Lock, Wallet, Users, ChevronDown, ChevronUp, ArrowUpCircle } from "lucide-react"
import Link from "next/link"
import { useSelectedEvent, useEventGuard } from "@/contexts/event-context"
import { useUser } from "@/hooks/useUser"
import { ProLockPanel } from "@/components/dashboard/pro-lock"

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
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">Memuat...</div>}>
      <PettyCashPageInner />
    </Suspense>
  )
}

function PettyCashPageInner() {
  const { isPro, loading: userLoading } = useUser()

  // Petty Cash PER-EVENT: event diwarisi dari EventProvider (bukan lagi halaman
  // lintas-konteks dengan dropdown sendiri). Sengaja dari context, BUKAN searchParams —
  // URL menyusul satu tick setelah navigasi, guard berbasis URL bisa salah memantulkan.
  const { selectedEventId } = useSelectedEvent()

  const [events, setEvents] = useState<Event[]>([])
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [fetchingCrew, setFetchingCrew] = useState(false)
  // Pro dicek PER-EVENT di backend (402) — gate `isPro` global di bawah tidak menangkap
  // kasus "akun Pro, tapi untuk event lain". Tanpa ini, daftar kas tampil kosong.
  const [proLocked, setProLocked] = useState(false)

  // Topup state per crew (accountId → amount)
  const [topupAmounts, setTopupAmounts] = useState<Record<string, string>>({})
  const [toppingUp, setToppingUp] = useState<Record<string, boolean>>({})
  const [expandedCrew, setExpandedCrew] = useState<Record<string, boolean>>({})

  // `eventsReady` HANYA true kalau daftar event benar-benar berhasil dimuat —
  // daftar kosong akibat request gagal tidak boleh dianggap "event sudah dihapus".
  const [eventsReady, setEventsReady] = useState(false)

  useEffect(() => {
    fetch("/api/events", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.success) { setEvents(data.data); setEventsReady(true) } })
      .catch(() => {})
  }, [])

  // Tanpa konteks event → balik ke pintu utama kategori Keuangan.
  // Event terpilih sudah dihapus → balik ke Dashboard KPI + pesan penjelas.
  useEventGuard({ events, ready: eventsReady, emptyHref: "/dashboard/pl-report" })

  useEffect(() => {
    if (!selectedEventId || !isPro) return
    setFetchingCrew(true)
    setProLocked(false)
    fetch(`/api/crew?eventId=${selectedEventId}`, { headers: authHeaders() })
      .then((r) => {
        if (r.status === 402) { setProLocked(true); return null }
        return r.ok ? r.json() : null
      })
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

  const selectedEvent = events.find((ev) => ev.id === selectedEventId) || null

  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
      </div>
    )
  }

  // Redirect sedang berjalan — jangan render konten halaman.
  if (!selectedEventId) return null

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

  // Backend menolak 402 (event ini belum Pro) → gembok + ajakan upgrade, bukan daftar kosong.
  if (proLocked) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div>
          <Link
            href={`/dashboard/pl-report?eventId=${selectedEventId}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="size-4" />
            Kembali ke Dashboard Keuangan
          </Link>
        </div>
        <ProLockPanel
          eventId={selectedEventId}
          featureName="Petty Cash"
          description="Event ini belum aktif Pro. Kas lapangan crew & top-up khusus Pro — upgrade untuk membuka fitur ini untuk event terpilih."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* Kembali ke pintu utama kategori Keuangan (event dipertahankan) */}
      <div>
        <Link
          href={`/dashboard/pl-report?eventId=${selectedEventId}`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Dashboard Keuangan
        </Link>
      </div>

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
              Settingan Kelola Crew
            </Link>
            . Pengeluaran crew otomatis masuk ke Laporan P&amp;L.
          </p>
        </div>
      </div>

      {/* Event aktif — dipilih di Dashboard Keuangan, bukan di sini */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Event</p>
        <p className="text-sm font-semibold text-slate-900">{selectedEvent?.title ?? "Memuat event..."}</p>
      </div>

      {/* Crew balance + top-up list */}
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
              Ke Halaman Settingan Kelola Crew →
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
    </div>
  )
}
