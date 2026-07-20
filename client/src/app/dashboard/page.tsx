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
} from "lucide-react"
import { StatCards } from "@/components/dashboard/stat-cards"
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

const QUICK_LINKS = [
  {
    label: "Dashboard Perencanaan",
    desc: "RAB, Purchase Order, dan simulasi harga tiket.",
    href: "/dashboard/perencanaan",
    icon: ClipboardList,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-700",
  },
  {
    label: "Kerjasama Sponsor",
    desc: "Deal sponsor, katalog benefit, dan invoice.",
    href: "/dashboard/kerjasama",
    icon: Handshake,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-700",
  },
  {
    label: "Tiket & Pencairan",
    desc: "Penjualan tiket, merchandise, dan pencairan dana.",
    href: "/dashboard/ticketing",
    icon: Ticket,
    iconBg: "bg-sky-50",
    iconColor: "text-sky-700",
  },
  {
    label: "Dashboard Keuangan",
    desc: "Laba/rugi, pengeluaran, dan petty cash.",
    href: "/dashboard/pl-report",
    icon: Wallet,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
  },
]

export default function DashboardKpiPage() {
  const router = useRouter()
  const { selectedEventId, setSelectedEventId } = useSelectedEvent()
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

  // Event terpilih sudah tidak ada (mis. baru dihapus) → bersihkan supaya halaman
  // turunan tidak memuat konteks hantu.
  useEffect(() => {
    if (!loadingEvents && selectedEventId && hasEvents && !selectedEvent) {
      setSelectedEventId("")
    }
  }, [loadingEvents, selectedEventId, hasEvents, selectedEvent, setSelectedEventId])

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
