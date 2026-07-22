"use client"

// ============================================================================
// DocumentTable — RAB untuk SATU event (event aktif di EventProvider).
// ----------------------------------------------------------------------------
// PERUBAHAN 2026-07-21 (keputusan founder): komponen ini dulu menampilkan tabel
// SELURUH event milik promotor sebagai alat navigasi ("pilih event mana yang mau
// dibuka RAB-nya"). Itu DICABUT — data RAB bersifat privat per-event dan tidak
// boleh dicampur lintas event, termasuk untuk keperluan navigasi.
//
// Sekarang: hanya baris event aktif. Ganti event dilakukan di pemilih tunggal
// Dashboard KPI (/dashboard) — ada tautan "Ganti event" di bawah. JANGAN bangun
// ulang daftar lintas-event di sini dalam bentuk apa pun.
//
// PERUBAHAN 2026-07-21 (kedua): tombol hapus event TIDAK lagi menghapus langsung.
// Ia mengajukan permintaan hapus yang harus disetujui admin (lihat
// EventChangeRequestPanel + CLAUDE.md "Permintaan Perubahan Event"). JANGAN
// kembalikan axios.delete ke sini.
//
// PERUBAHAN 2026-07-21 (ketiga): tombol "Ajukan Hapus" ikut DICABUT dari sini.
// Seluruh administrasi event (buat / ubah field terkunci / ajukan hapus /
// riwayat) pindah ke /dashboard/setup-event — satu pintu, satu implementasi.
// Komponen ini murni soal RAB lagi. JANGAN tambahkan kembali aksi hapus di sini.
// ============================================================================

import { useEffect, useState } from "react"
import axios from "axios"
import Link from "next/link"
import { CalendarRange, RotateCw, Settings2 } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useSelectedEvent } from "@/contexts/event-context"

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  }).format(new Date(dateStr))
}

interface EventDetail {
  id: number | string
  title: string
  location: string
  event_date: string
}

export function DocumentTable() {
  const { selectedEventId, invalidateEvent } = useSelectedEvent()
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Halaman Perencanaan TIDAK memuat daftar event, jadi ia tidak bisa memakai
  // useEventGuard (yang mendeteksi lewat daftar). Di sini deteksinya lewat 404
  // dari GET /api/events/:id — satu-satunya tempat di dashboard yang memakai
  // jalur 404, bukan jalur daftar.
  //
  // Sengaja TIDAK ikut me-redirect: komponen bersama tidak boleh memindahkan
  // halaman di bawah kaki induknya. Cukup laporkan ke provider — pilihan event
  // dibersihkan secara global + toast penjelas muncul, dan seluruh seksi
  // /dashboard/perencanaan otomatis jatuh ke empty state "pilih event".
  useEffect(() => {
    if (!selectedEventId) {
      setEvent(null)
      return
    }
    const token = localStorage.getItem("token")
    setIsLoading(true)
    axios
      .get(`/api/events/${selectedEventId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const data = res.data?.data ?? res.data
        setEvent(data && data.id ? data : null)
      })
      .catch((err) => {
        setEvent(null)
        // 404/403 = event sudah tidak ada (atau bukan milik user lagi). Error
        // jaringan TIDAK dihitung — jangan tandai mati hanya karena koneksi putus.
        const status = axios.isAxiosError(err) ? err.response?.status : undefined
        if (status === 404 || status === 403) invalidateEvent(selectedEventId)
      })
      .finally(() => setIsLoading(false))
    // `invalidateEvent` sengaja di luar deps: identitasnya berubah tiap searchParams
    // berubah, dan efek ini hanya boleh jalan saat event berganti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId])

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Rencana Anggaran Biaya (RAB)</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            RAB untuk event yang sedang aktif. Satu event = satu RAB.
          </p>
        </div>
        {selectedEventId && (
          <div className="flex shrink-0 items-center gap-4">
            <Link
              href="/dashboard/setup-event"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
              title="Ubah data event / ajukan hapus event"
            >
              <Settings2 className="size-4" />
              Setup Event
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
            >
              Ganti event
            </Link>
          </div>
        )}
      </div>

      {!selectedEventId ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <CalendarRange className="size-8 text-slate-300" />
          <p className="text-sm text-slate-500">Pilih event terlebih dahulu untuk melihat RAB-nya.</p>
          <Link href="/dashboard">
            <Button variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
              Pilih event di Dashboard
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 hover:bg-transparent">
                <TableHead className="py-3.5 pl-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Dokumen
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Event &amp; Lokasi
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Tanggal Event
                </TableHead>
                <TableHead className="pr-5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Nilai RAB
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-sm text-slate-500">
                    <RotateCw className="mx-auto mb-2 size-4 animate-spin text-slate-400" />
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : !event ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-sm text-slate-500">
                    Event tidak ditemukan atau sudah dihapus.
                  </TableCell>
                </TableRow>
              ) : (
                <EventTableRow event={event} />
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

// ── EventTableRow: baris RAB event aktif ────────────────────────────────────────

function EventTableRow({ event }: { event: EventDetail }) {
  const [budgetTotal, setBudgetTotal] = useState<number | null>(null)
  const [isLoadingBudget, setIsLoadingBudget] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("token")
    setIsLoadingBudget(true)
    axios
      .get(`/api/budgets/${event.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const budgetData = res.data.budget ?? res.data.data ?? res.data
        if (budgetData && Object.keys(budgetData).length > 0) {
          const total =
            Number(budgetData.totalEstimatedCost ?? 0) + Number(budgetData.contingencyFundAmount ?? 0)
          setBudgetTotal(total)
        } else {
          setBudgetTotal(null)
        }
      })
      .catch(() => setBudgetTotal(null))
      .finally(() => setIsLoadingBudget(false))
  }, [event.id])

  return (
    <TableRow className="border-slate-200 transition-colors hover:bg-slate-50">
      {/* Dokumen */}
      <TableCell className="py-4 pl-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-emerald-800">
            <CalendarRange className="size-4" />
          </div>
          <div className="leading-tight">
            <p className="font-mono text-sm font-medium text-slate-900">{event.title}</p>
            <span className="text-xs text-slate-500">Event aktif</span>
          </div>
        </div>
      </TableCell>

      {/* Event & Lokasi */}
      <TableCell>
        <p className="max-w-60 truncate font-medium text-slate-900">{event.title}</p>
        <p className="max-w-60 truncate text-xs text-slate-500">{event.location}</p>
      </TableCell>

      {/* Tanggal Event */}
      <TableCell>
        <p className="text-sm text-slate-900">{formatDate(event.event_date)}</p>
      </TableCell>

      {/* Nilai RAB */}
      {/* Kolom "Aksi" (tombol Kelola RAB per baris) DIHAPUS 2026-07-22 —
          digantikan tombol "Kelola RAB" di baris aksi cepat header halaman
          Perencanaan (commit 5f64d59). Badge status RAB tetap di sini. */}
      <TableCell className="pr-5 text-right">
        {isLoadingBudget ? (
          <span className="text-xs text-slate-400 animate-pulse">Menghitung...</span>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
              {formatCurrency(budgetTotal || 0)}
            </span>
            {budgetTotal !== null ? (
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-xs font-medium border-emerald-200 bg-emerald-50 text-emerald-700">
                Ada RAB
              </Badge>
            ) : (
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-xs font-medium border-amber-200 bg-amber-50 text-amber-700">
                Belum Ada RAB
              </Badge>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}
