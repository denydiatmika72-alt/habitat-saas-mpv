"use client"

// ============================================================================
// Dashboard KPI — halaman utama /dashboard (Layer 3).
// ----------------------------------------------------------------------------
// Ini SATU-SATUNYA tempat event dipilih. Pilihan disimpan di EventProvider
// (contexts/event-context.tsx) dan diwariskan ke seluruh halaman /dashboard
// lewat ?eventId=, menggantikan pola lama "tiap hub kategori punya dropdown
// sendiri". Isinya: ringkasan KPI + pemilih event + Buat Event Baru + 4 kartu
// akses cepat ke dashboard kategori.
//
// Tabel RAB & Purchase Order TIDAK di sini lagi — keduanya pindah ke
// Dashboard Perencanaan (/dashboard/perencanaan).
// ============================================================================

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import axios from "axios"
import {
  ClipboardList,
  Handshake,
  Ticket,
  Wallet,
  Plus,
  CalendarRange,
  ArrowRight,
  Lock,
} from "lucide-react"
import { StatCards, formatCompact } from "@/components/dashboard/stat-cards"
import { Button } from "@/components/ui/button"
import { useSelectedEvent } from "@/contexts/event-context"

const API_BASE = "/api"
const getToken = () =>
  typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` })

interface EventItem {
  id: number | string
  title: string
}

// Bentuk respons GET /api/dashboard/summary?eventId= (dashboard.controller.js).
// Seksi sponsor & finance ber-proLocked per-seksi (fitur Pro); rab & ticketing selalu terisi.
interface DashboardSummary {
  rab: { exists: boolean; total: number }
  sponsor:
    | { proLocked: true }
    | { proLocked: false; activeDeals: number; approvedValue: number }
  ticketing: { ticketsSold: number; payoutAvailable: number }
  finance:
    | { proLocked: true }
    | { proLocked: false; totalIncome: number; totalExpense: number }
}

type QuickLinkKey = "rab" | "sponsor" | "ticketing" | "finance"

const QUICK_LINKS: {
  key: QuickLinkKey
  label: string
  desc: string
  href: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
}[] = [
  {
    key: "rab",
    label: "Dashboard Perencanaan",
    desc: "RAB, Purchase Order, dan simulasi harga tiket.",
    href: "/dashboard/perencanaan",
    icon: ClipboardList,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-700",
  },
  {
    key: "sponsor",
    label: "Kerjasama Sponsor",
    desc: "Deal sponsor, katalog benefit, dan invoice.",
    href: "/dashboard/kerjasama",
    icon: Handshake,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-700",
  },
  {
    key: "ticketing",
    label: "Tiket & Pencairan",
    desc: "Penjualan tiket, merchandise, dan pencairan dana.",
    href: "/dashboard/ticketing",
    icon: Ticket,
    iconBg: "bg-sky-50",
    iconColor: "text-sky-700",
  },
  {
    key: "finance",
    label: "Dashboard Keuangan",
    desc: "Laba/rugi, pengeluaran, dan petty cash.",
    href: "/dashboard/pl-report",
    icon: Wallet,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
  },
]

// ── Blok ringkasan per kartu Akses Cepat ─────────────────────────────────────
// Top-level (BUKAN di dalam komponen halaman — lihat aturan CLAUDE.md soal
// komponen inline yang bikin remount tiap render).
// Gembok Pro versi RINGKAS (ikon + label + tooltip), sengaja bukan ProLockPanel
// penuh — kartu kecil; klik kartu tetap membawa ke hub yang menampilkan lock UI
// lengkapnya sendiri.
function ProLockedMini() {
  return (
    <div
      className="flex items-center gap-1.5 text-xs font-medium text-slate-400"
      title="Khusus Pro — upgrade event ini untuk melihat ringkasannya"
    >
      <Lock className="size-3.5" />
      Khusus Pro
    </div>
  )
}

function QuickLinkMetric({
  linkKey,
  summary,
  loading,
  hasEvent,
}: {
  linkKey: QuickLinkKey
  summary: DashboardSummary | null
  loading: boolean
  hasEvent: boolean
}) {
  if (!hasEvent) {
    return <p className="text-xs text-slate-400">Pilih event untuk melihat ringkasan.</p>
  }
  if (loading) {
    return <div className="h-6 w-24 animate-pulse rounded-md bg-slate-100" />
  }
  if (!summary) {
    return <p className="text-xs text-slate-400">Ringkasan tidak tersedia.</p>
  }

  switch (linkKey) {
    case "rab":
      return summary.rab.exists ? (
        <div>
          <p className="text-lg font-semibold tracking-tight text-slate-900">
            {formatCompact(summary.rab.total)}
          </p>
          <p className="text-xs text-slate-500">Total Nilai RAB</p>
        </div>
      ) : (
        <p className="text-sm font-medium text-amber-600">Belum Ada RAB</p>
      )

    case "sponsor":
      if (summary.sponsor.proLocked) return <ProLockedMini />
      return (
        <div>
          <p className="text-lg font-semibold tracking-tight text-slate-900">
            {summary.sponsor.activeDeals}{" "}
            <span className="text-sm font-normal text-slate-500">deal disetujui</span>
          </p>
          <p className="text-xs text-slate-500">
            Nilai closing: {formatCompact(summary.sponsor.approvedValue)}
          </p>
        </div>
      )

    case "ticketing":
      return (
        <div>
          <p className="text-lg font-semibold tracking-tight text-slate-900">
            {summary.ticketing.ticketsSold.toLocaleString("id-ID")}{" "}
            <span className="text-sm font-normal text-slate-500">tiket terjual</span>
          </p>
          {/* Payout memang lintas-event by design → dilabeli Saldo Akun, bukan per-event. */}
          <p className="text-xs text-slate-500">
            Saldo Akun (semua event): {formatCompact(summary.ticketing.payoutAvailable)}
          </p>
        </div>
      )

    case "finance":
      if (summary.finance.proLocked) return <ProLockedMini />
      return (
        <div className="flex items-end gap-4">
          <div>
            <p className="text-sm font-semibold tracking-tight text-emerald-700">
              {formatCompact(summary.finance.totalIncome)}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Pemasukan
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight text-rose-600">
              {formatCompact(summary.finance.totalExpense)}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              Pengeluaran
            </p>
          </div>
        </div>
      )
  }
}

export default function DashboardKpiPage() {
  const router = useRouter()
  const { selectedEventId, setSelectedEventId, invalidateEvent } = useSelectedEvent()
  const [events, setEvents] = useState<EventItem[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)

  useEffect(() => {
    axios
      .get(`${API_BASE}/events`, { headers: authHeaders() })
      .then((res) => {
        const data: EventItem[] = Array.isArray(res.data) ? res.data : (res.data.data ?? [])
        setEvents(data)
      })
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false))
  }, [])

  const selectedEvent = events.find((e) => String(e.id) === selectedEventId) ?? null
  const hasEvents = events.length > 0

  // Ringkasan 4 kartu Akses Cepat — SATU call agregat, refetch saat event berganti.
  // Deps HANYA `selectedEventId` (string primitif) dan efek tidak menulis state yang
  // ia baca sendiri → aman dari kelas loop 2026-07-21.
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  useEffect(() => {
    if (!selectedEventId) {
      setSummary(null)
      return
    }
    let cancelled = false
    setLoadingSummary(true)
    axios
      .get(`${API_BASE}/dashboard/summary?eventId=${selectedEventId}`, { headers: authHeaders() })
      .then((res) => {
        if (!cancelled) setSummary(res.data?.data ?? null)
      })
      .catch(() => {
        // 404/403 (event mati/bukan milik) atau error jaringan → kartu jatuh ke
        // "Ringkasan tidak tersedia". Deteksi event mati sudah ditangani efek
        // invalidateEvent di bawah — jangan double-handle di sini.
        if (!cancelled) setSummary(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedEventId])

  // Event terpilih sudah tidak ada (mis. dihapus lewat persetujuan admin) →
  // bersihkan supaya halaman turunan tidak memuat konteks hantu.
  //
  // WAJIB pakai invalidateEvent, BUKAN setSelectedEventId(""). Yang terakhir itu
  // penyebab loop tak berujung 2026-07-21: `?eventId=` yang mati masih tertinggal
  // di URL selama router.replace belum landing, provider menghidupkannya kembali,
  // efek ini membersihkannya lagi, dan seterusnya — membanjiri GET /api/events
  // sampai browser kehabisan koneksi. invalidateEvent bersifat terminal.
  useEffect(() => {
    if (!loadingEvents && selectedEventId && hasEvents && !selectedEvent) {
      invalidateEvent(selectedEventId)
    }
  }, [loadingEvents, selectedEventId, hasEvents, selectedEvent, invalidateEvent])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-800">
            Workspace Promotor
          </p>
          <h1 className="mt-2 text-pretty text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            Dashboard
          </h1>
          <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-slate-500">
            Pilih event di sini sekali — seluruh halaman dashboard akan mengikuti event yang Anda pilih.
          </p>
        </div>

        <Button
          className="shrink-0 gap-2 bg-emerald-800 text-white hover:bg-emerald-900 print:hidden"
          onClick={() => router.push("/dashboard/create-event")}
        >
          <Plus className="size-4" />
          Buat Event Baru
        </Button>
      </div>

      {/* ── Pemilih Event ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <CalendarRange className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight text-slate-900">Event Aktif</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {selectedEvent
                  ? "Semua halaman dashboard menampilkan data event ini."
                  : "Belum ada event dipilih — pilih dulu untuk membuka data per-event."}
              </p>
            </div>
          </div>

          {loadingEvents ? (
            <div className="h-10 w-full animate-pulse rounded-lg bg-slate-100 md:w-72" />
          ) : hasEvents ? (
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              aria-label="Pilih event aktif"
              className="h-10 w-full truncate rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 md:w-72"
            >
              <option value="">— Pilih event —</option>
              {events.map((ev) => (
                <option key={ev.id} value={String(ev.id)}>
                  {ev.title}
                </option>
              ))}
            </select>
          ) : (
            <Link href="/dashboard/create-event">
              <Button variant="outline" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                <Plus className="size-4" />
                Buat event pertama Anda
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* ── Ringkasan KPI ────────────────────────────────────────────────── */}
      <StatCards eventId={selectedEventId || undefined} />

      {/* ── Akses Cepat ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold tracking-tight text-slate-900">Akses Cepat</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Empat dashboard kategori. Event yang dipilih di atas ikut terbawa.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
            >
              <div className={`flex size-10 items-center justify-center rounded-lg ${link.iconBg} ${link.iconColor}`}>
                <link.icon className="size-5" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-900">{link.label}</p>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-500">{link.desc}</p>

              {/* Ringkasan event terpilih (GET /api/dashboard/summary) */}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <QuickLinkMetric
                  linkKey={link.key}
                  summary={summary}
                  loading={loadingSummary}
                  hasEvent={!!selectedEventId}
                />
              </div>

              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                Buka
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
