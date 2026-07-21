"use client"

// ============================================================================
// Setup Event — pusat ADMINISTRASI event (2026-07-21).
// ----------------------------------------------------------------------------
// Semua yang berurusan dengan event SEBAGAI OBJEK dikumpulkan di sini:
//   • Buat Event Baru        → /dashboard/create-event (flow lama, tidak diubah)
//   • Ajukan Perubahan       → 5 field terkunci (EventChangeRequestPanel)
//   • Ajukan Hapus           → permintaan hapus ke admin (di panel yang sama)
//   • Riwayat Permintaan     → status ajuan (di panel yang sama)
//
// Sebelumnya panel ajuan menumpang di /dashboard/perencanaan dan tombol "Ajukan
// Hapus" menempel di DocumentTable. Keduanya DICABUT: Perencanaan kembali murni
// soal RAB/anggaran, halaman ini yang mengurus event-nya sendiri.
//
// ── Kenapa TIDAK memakai useEventGuard ──────────────────────────────────────
// useEventGuard memantulkan user ke hub saat belum ada event terpilih, dan butuh
// daftar event (`events` + `ready`) untuk mendeteksi event mati. Halaman ini:
//   1. TETAP berguna tanpa event terpilih — "Buat Event Baru" justru jalan keluar
//      dari kondisi itu. Memantulkan user ke /dashboard malah menjebak orang yang
//      belum punya event sama sekali.
//   2. Tidak memuat daftar event, jadi tidak punya bahan untuk `events`/`ready`.
// Deteksi event mati tetap ada, tapi lewat jalur 404 (sama seperti DocumentTable):
// GET /api/events/:id gagal 404/403 → `invalidateEvent` → pilihan dibersihkan
// secara global dan halaman ini jatuh ke empty state, TANPA redirect. Panel-nya
// sendiri me-render null kalau event gagal dimuat.
// ============================================================================

import { useEffect, useState } from "react"
import axios from "axios"
import Link from "next/link"
import { ArrowLeft, ArrowRight, CalendarRange, Plus, Settings2 } from "lucide-react"
import { EventChangeRequestPanel } from "@/components/dashboard/event-change-request-panel"
import { Button } from "@/components/ui/button"
import { useSelectedEvent } from "@/contexts/event-context"

interface EventHeaderInfo {
  id: number | string
  title: string
  location: string
}

export default function SetupEventPage() {
  const { selectedEventId, invalidateEvent } = useSelectedEvent()
  const [event, setEvent] = useState<EventHeaderInfo | null>(null)

  // Hanya untuk judul kartu konteks + deteksi event mati lewat 404.
  // `invalidateEvent` SENGAJA di luar deps: identitasnya berubah tiap searchParams
  // berubah, sementara efek ini hanya boleh jalan saat event berganti (kalau ikut
  // masuk deps, efeknya berulang → kelas bug loop 2026-07-21).
  useEffect(() => {
    if (!selectedEventId) {
      setEvent(null)
      return
    }
    const token = localStorage.getItem("token")
    axios
      .get(`/api/events/${selectedEventId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const data = res.data?.data ?? res.data
        setEvent(data && data.id ? data : null)
      })
      .catch((err) => {
        setEvent(null)
        // Error jaringan TIDAK dihitung — jangan tandai mati hanya karena koneksi putus.
        const status = axios.isAxiosError(err) ? err.response?.status : undefined
        if (status === 404 || status === 403) invalidateEvent(selectedEventId)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId])

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      {/* ── Kembali ke hub utama ─────────────────────────────────────────── */}
      <Link
        href="/dashboard"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="size-4" />
        Kembali ke Dashboard
      </Link>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-800">
          Administrasi Event
        </p>
        <h1 className="mt-2 text-pretty text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
          Setup Event
        </h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-slate-500">
          Buat event baru, ajukan perubahan data event yang terkunci, ajukan penghapusan,
          dan pantau status permintaan Anda di satu tempat.
        </p>
      </div>

      {/* ── Buat Event Baru ──────────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Plus className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">Buat Event Baru</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Jumlah event tidak dibatasi. Fitur Pro dibeli per event, bukan per akun.
              </p>
            </div>
          </div>

          <Link href="/dashboard/create-event" className="shrink-0">
            <Button className="gap-2 bg-emerald-800 font-medium text-white hover:bg-emerald-900">
              <Plus className="size-4" />
              Buat Event Baru
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Konteks event aktif + panel ajuan ────────────────────────────── */}
      {selectedEventId ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-emerald-800">
                  <CalendarRange className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Event yang sedang dikelola
                  </p>
                  <p className="mt-1 truncate text-base font-semibold text-slate-900">
                    {event?.title ?? "Memuat..."}
                  </p>
                  {event?.location && (
                    <p className="truncate text-xs text-slate-500">{event.location}</p>
                  )}
                </div>
              </div>

              <Link
                href="/dashboard"
                className="shrink-0 text-sm font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
              >
                Ganti event
              </Link>
            </div>
          </section>

          <EventChangeRequestPanel eventId={selectedEventId} />
        </>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Settings2 className="size-8 text-slate-300" />
            <p className="max-w-sm text-sm text-slate-500">
              Belum ada event yang dipilih. Buat event baru di atas, atau pilih event yang
              sudah ada untuk mengajukan perubahan data terkunci &amp; penghapusan.
            </p>
            <Link href="/dashboard">
              <Button
                variant="outline"
                className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                Pilih event di Dashboard
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}
