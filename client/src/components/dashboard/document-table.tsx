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
// ============================================================================

import { useEffect, useState } from "react"
import axios from "axios"
import Link from "next/link"
import { CalendarRange, RotateCw, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
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
  const { selectedEventId, setSelectedEventId } = useSelectedEvent()
  const router = useRouter()
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)

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
      .catch(() => setEvent(null))
      .finally(() => setIsLoading(false))
  }, [selectedEventId])

  const handleDeleteEvent = async () => {
    if (!event) return
    if (!confirm(`Hapus event "${event.title}" beserta seluruh datanya secara permanen?`)) return
    try {
      const token = localStorage.getItem("token")
      await axios.delete(`/api/events/${event.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      // Event aktif sudah tidak ada → bersihkan konteks & kembali ke pemilih event.
      setSelectedEventId("")
      router.push("/dashboard")
    } catch {
      alert("❌ Gagal menghapus event.")
    }
  }

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
          <Link
            href="/dashboard"
            className="shrink-0 text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
          >
            Ganti event
          </Link>
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
                <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Nilai RAB
                </TableHead>
                <TableHead className="sticky right-0 bg-white z-10 pr-5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Aksi
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-slate-500">
                    <RotateCw className="mx-auto mb-2 size-4 animate-spin text-slate-400" />
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : !event ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-slate-500">
                    Event tidak ditemukan atau sudah dihapus.
                  </TableCell>
                </TableRow>
              ) : (
                <EventTableRow event={event} onDelete={handleDeleteEvent} />
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

// ── EventTableRow: baris RAB event aktif ────────────────────────────────────────

function EventTableRow({ event, onDelete }: { event: EventDetail; onDelete: () => void }) {
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
      <TableCell className="text-right">
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

      {/* Aksi */}
      <TableCell className="sticky right-0 bg-white z-10 pr-5">
        <div className="flex items-center justify-end gap-1.5">
          <Link href={`/dashboard/rab/${event.id}`}>
            <Button size="sm" className="h-8 bg-emerald-800 text-white hover:bg-emerald-900">
              Kelola RAB
            </Button>
          </Link>
          <Button
            size="icon"
            variant="outline"
            onClick={onDelete}
            className="h-8 w-8 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
            title="Hapus Event"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
