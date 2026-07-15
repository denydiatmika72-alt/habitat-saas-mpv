"use client"

import { Suspense, useEffect, useState } from "react"
import { ArrowLeft, Lock, FileCheck, FileDown, CheckCircle2, Loader2, Mail, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useUser } from "@/hooks/useUser"

type EventItem = { id: string; title: string; finishedAt: string | null }

const getToken = () => (typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "")
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" })
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-"

export default function EventSummaryPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">Memuat...</div>}>
      <EventSummaryPageInner />
    </Suspense>
  )
}

function EventSummaryPageInner() {
  const { isPro, loading: userLoading } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Event diwarisi dari Dashboard Keuangan — halaman ini bukan pintu masuk sendiri.
  const selectedEventId = searchParams.get("eventId") ?? ""

  const [events, setEvents] = useState<EventItem[]>([])
  const [finishing, setFinishing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Tanpa konteks event, kembalikan ke pintu utama kategori Keuangan.
  useEffect(() => {
    if (!selectedEventId) router.replace("/dashboard/pl-report")
  }, [selectedEventId, router])

  useEffect(() => {
    fetch("/api/events", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.success) setEvents(data.data) })
      .catch(() => {})
  }, [])

  const selectedEvent = events.find((e) => e.id === selectedEventId) || null

  const handleFinish = async () => {
    if (!selectedEvent) return
    const already = !!selectedEvent.finishedAt
    const confirmText = already
      ? `Event "${selectedEvent.title}" sudah pernah ditandai selesai. Buat ulang laporan akhir & kirim ulang ke email Anda?`
      : `Tandai event "${selectedEvent.title}" sebagai SELESAI? Laporan akhir akan dibuat dan dikirim ke email Anda. Data event tetap tersimpan.`
    if (!window.confirm(confirmText)) return

    setFinishing(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/events/${selectedEventId}/finish`, { method: "POST", headers: authHeaders() })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setMessage({ type: "error", text: data.message || "Gagal menyelesaikan event." })
        return
      }
      // Refleksikan finishedAt ke state lokal.
      setEvents((prev) => prev.map((e) => (e.id === selectedEventId ? { ...e, finishedAt: data.finishedAt } : e)))
      setMessage({ type: "success", text: data.message })
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Terjadi kesalahan." })
    } finally {
      setFinishing(false)
    }
  }

  const handleDownload = async () => {
    if (!selectedEventId) return
    setDownloading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/events/${selectedEventId}/summary-pdf`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) {
        let text = `Server error (${res.status})`
        try { const err = await res.json(); text = (err as { message?: string }).message || text } catch { text = res.statusText || text }
        setMessage({ type: "error", text: "Gagal mengunduh: " + text })
        return
      }
      const blob = await res.blob()
      if (blob.size < 100) { setMessage({ type: "error", text: "PDF kosong — coba lagi." }); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Laporan-Event-${(selectedEvent?.title || "event").replace(/[^a-zA-Z0-9]/g, "-").slice(0, 40)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setMessage({ type: "error", text: "Gagal mengunduh PDF: " + (e instanceof Error ? e.message : "Unknown error") })
    } finally {
      setDownloading(false)
    }
  }

  // ── Loading ──
  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
      </div>
    )
  }

  // Redirect sedang berjalan — jangan render konten halaman.
  if (!selectedEventId) return null

  // ── Lock UI (Starter) ──
  if (!isPro) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <Header />
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-slate-100">
            <Lock className="size-8 text-slate-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">Fitur Pro</p>
            <p className="mt-1 max-w-xs text-sm text-slate-500">Laporan Akhir Event tersedia untuk pengguna Pro. Upgrade untuk akses penuh.</p>
          </div>
          <Link href="/dashboard/upgrade" className="rounded-xl bg-emerald-800 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-900">
            Upgrade ke Pro
          </Link>
        </div>
      </div>
    )
  }

  // ── Main ──
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* Kembali ke pintu utama kategori Keuangan (event dipertahankan) */}
      <div>
        <Link
          href={`/dashboard/pl-report?eventId=${selectedEventId}`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Dashboard Keuangan
        </Link>
      </div>

      <Header />

      {/* Event aktif — dipilih di Dashboard Keuangan, bukan di sini */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Event</p>
        <p className="text-sm font-semibold text-slate-900">
          {selectedEvent ? `${selectedEvent.title}${selectedEvent.finishedAt ? "  (selesai)" : ""}` : "Memuat event..."}
        </p>
      </div>

      {selectedEvent && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          {selectedEvent.finishedAt ? (
            <div className="mb-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>Event ini sudah ditandai selesai pada <strong>{fmtDate(selectedEvent.finishedAt)}</strong>.</span>
            </div>
          ) : (
            <p className="mb-5 text-sm text-slate-500">
              Menandai event selesai akan membuat laporan akhir (keuangan, sponsor, pengeluaran, penjualan tiket per channel,
              data audiens, petty cash, hutang fee, & pencairan) lalu mengirimnya ke email Anda. Data event tetap tersimpan.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleFinish}
              disabled={finishing}
              className="flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-900 disabled:opacity-60"
            >
              {finishing ? <Loader2 className="size-4 animate-spin" /> : <FileCheck className="size-4" />}
              {finishing ? "Memproses..." : selectedEvent.finishedAt ? "Buat & Kirim Ulang Laporan" : "Tandai Event Selesai & Kirim Laporan"}
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              {downloading ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
              {downloading ? "Menyiapkan..." : "Unduh Laporan PDF"}
            </button>
          </div>

          {message && (
            <div className={`mt-5 flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${message.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
              {message.type === "success" ? <Mail className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
              <span>{message.text}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Header() {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
        <FileCheck className="size-5" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Laporan Akhir Event</h1>
          <span className="rounded-full bg-emerald-800 px-2 py-0.5 text-[10px] font-bold text-white">PRO</span>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">Tandai event selesai untuk menghasilkan laporan akhir lengkap dan mengirimnya ke email Anda.</p>
      </div>
    </div>
  )
}
