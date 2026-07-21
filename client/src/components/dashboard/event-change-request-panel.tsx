"use client"

// ============================================================================
// EventChangeRequestPanel — ajukan perubahan 5 field terkunci + HAPUS EVENT,
// lengkap dengan riwayat statusnya.
// ----------------------------------------------------------------------------
// Sejak 2026-07-21 nama event, lokasi venue, kapasitas venue, target profit, dan
// target sponsor TIDAK bisa diubah langsung promotor — harus lewat persetujuan
// admin. Panel ini adalah satu-satunya pintu ajuan di sisi promotor.
//
// PERUBAHAN 2026-07-21 (konsolidasi navigasi): ajuan HAPUS EVENT sekarang ADA di
// sini juga. Dulu tombolnya menempel pada baris event di DocumentTable; itu
// DICABUT supaya seluruh administrasi event (buat / ubah / hapus / riwayat)
// berkumpul di satu halaman: /dashboard/setup-event. JANGAN kembalikan tombol
// ajuan hapus ke DocumentTable — nanti ada dua implementasi yang bisa menyimpang.
//
// Panel ini dirender HANYA di /dashboard/setup-event.
// ============================================================================

import { useCallback, useEffect, useState } from "react"
import axios from "axios"
import { ClipboardCheck, Clock, Lock, RotateCw, ShieldCheck, Trash2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

// requestType → label + cara render nilainya. Cerminan LOCKED_FIELDS di
// server/services/event-change-request.service.js — kalau di sana bertambah, tambah di sini juga.
const LOCKED_FIELDS = [
  { type: "rename", label: "Nama Event", field: "title", kind: "text" },
  { type: "venue_location", label: "Lokasi Venue", field: "location", kind: "text" },
  { type: "venue_capacity", label: "Kapasitas Venue", field: "venue_capacity", kind: "number" },
  { type: "target_profit", label: "Target Profit", field: "target_profit", kind: "currency" },
  { type: "target_sponsor", label: "Target Sponsor", field: "target_sponsorship", kind: "currency" },
] as const

const REQUEST_TYPE_LABELS: Record<string, string> = {
  delete: "Hapus Event (permanen)",
  ...Object.fromEntries(LOCKED_FIELDS.map((f) => [f.type, f.label])),
}

export interface EventChangeRequest {
  id: string
  requestType: string
  oldValue: string | null
  newValue: string | null
  status: "pending" | "approved" | "rejected"
  adminNote: string | null
  reviewedAt: string | null
  createdAt: string
}

interface LockedEvent {
  id: string
  title: string
  location: string
  venue_capacity: number
  target_profit: string | number
  target_sponsorship: string | number
}

function formatIDR(value: string | number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value))
}

function displayValue(kind: string, raw: string | number | null): string {
  if (raw === null || raw === undefined || raw === "") return "—"
  if (kind === "currency") return formatIDR(raw)
  if (kind === "number") return Number(raw).toLocaleString("id-ID")
  return String(raw)
}

// Tampilan nilai pada RIWAYAT — jenis permintaan dipetakan balik ke kind field-nya.
function displayHistoryValue(requestType: string, raw: string | null): string {
  const spec = LOCKED_FIELDS.find((f) => f.type === requestType)
  return displayValue(spec?.kind ?? "text", raw)
}

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` })

export function EventChangeRequestPanel({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<LockedEvent | null>(null)
  const [requests, setRequests] = useState<EventChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [openType, setOpenType] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [evRes, reqRes] = await Promise.all([
        axios.get(`/api/events/${eventId}`, { headers: authHeaders() }),
        axios.get(`/api/events/${eventId}/change-requests`, { headers: authHeaders() }),
      ])
      setEvent(evRes.data?.data ?? evRes.data ?? null)
      setRequests(reqRes.data?.data ?? [])
    } catch {
      setEvent(null)
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    void load()
  }, [load])

  // Jenis yang sudah punya ajuan pending → tombolnya dikunci (backend juga menolak dengan 409).
  const pendingTypes = new Set(requests.filter((r) => r.status === "pending").map((r) => r.requestType))

  function startEdit(type: string, currentValue: string | number) {
    setOpenType(type)
    setDraft(String(currentValue ?? ""))
    setFeedback(null)
  }

  // SATU-SATUNYA jalur pengiriman ajuan di sisi promotor — dipakai kelima field
  // terkunci MAUPUN ajuan hapus event (`type === "delete"`, tanpa newValue).
  async function submitRequest(type: string, newValue?: string) {
    setSubmitting(true)
    setFeedback(null)
    try {
      await axios.post(
        `/api/events/${eventId}/change-requests`,
        type === "delete" ? { requestType: type } : { requestType: type, newValue: newValue ?? draft },
        { headers: authHeaders() }
      )
      setOpenType(null)
      setDraft("")
      setFeedback({ kind: "ok", text: "Permintaan terkirim. Menunggu persetujuan admin." })
      await load()
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.message
          ? err.response.data.message
          : "Gagal mengirim permintaan."
      setFeedback({ kind: "error", text: message })
    } finally {
      setSubmitting(false)
    }
  }

  async function requestDelete() {
    if (!event) return
    if (
      !confirm(
        `Ajukan penghapusan event "${event.title}"?\n\n` +
          "Event TIDAK langsung terhapus. Permintaan dikirim ke admin untuk ditinjau, " +
          "dan event tetap berjalan normal selama menunggu keputusan."
      )
    )
      return
    await submitRequest("delete")
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <RotateCw className="size-4 animate-spin text-slate-400" />
          Memuat data event...
        </div>
      </section>
    )
  }

  if (!event) return null

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start gap-3 border-b border-slate-200 p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <Lock className="size-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Data Event Terkunci</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Lima data di bawah hanya bisa diubah lewat persetujuan admin. Ajukan perubahan, lalu pantau
            statusnya di riwayat. Event tetap berjalan normal selama permintaan diproses.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`mx-5 mt-5 rounded-lg border px-4 py-3 text-sm ${
            feedback.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* ── Daftar field terkunci ─────────────────────────────────────────── */}
      <div className="divide-y divide-slate-100">
        {LOCKED_FIELDS.map((spec) => {
          const currentValue = event[spec.field as keyof LockedEvent] as string | number
          const isPending = pendingTypes.has(spec.type)
          const isOpen = openType === spec.type

          return (
            <div key={spec.type} className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    {spec.label}
                  </p>
                  <p className="mt-1 truncate text-base font-semibold text-slate-900">
                    {displayValue(spec.kind, currentValue)}
                  </p>
                </div>

                {isPending ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                    <Clock className="size-3.5" />
                    Menunggu persetujuan admin
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => (isOpen ? setOpenType(null) : startEdit(spec.type, currentValue))}
                    className="h-8 shrink-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  >
                    {isOpen ? "Batal" : "Ajukan Perubahan"}
                  </Button>
                )}
              </div>

              {isOpen && !isPending && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <label
                    htmlFor={`draft-${spec.type}`}
                    className="block text-xs font-medium text-slate-600"
                  >
                    {spec.label} yang diusulkan
                  </label>
                  <input
                    id={`draft-${spec.type}`}
                    type={spec.kind === "text" ? "text" : "number"}
                    min={spec.kind === "text" ? undefined : 0}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder={`Masukkan ${spec.label.toLowerCase()} baru`}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Nilai saat ini: <strong>{displayValue(spec.kind, currentValue)}</strong>. Perubahan baru
                    berlaku setelah admin menyetujui.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      disabled={submitting || !draft.trim()}
                      onClick={() => void submitRequest(spec.type)}
                      className="h-8 bg-emerald-800 text-white hover:bg-emerald-900"
                    >
                      {submitting ? "Mengirim..." : "Kirim Permintaan"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpenType(null)}
                      className="h-8 border-slate-200"
                    >
                      Batal
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Ajukan Hapus Event ─────────────────────────────────────────────
          Pindahan dari DocumentTable (2026-07-21). Event TIDAK langsung terhapus:
          endpoint DELETE /api/events/:id untuk promotor selalu 403, penghapusan
          hanya dieksekusi admin saat menyetujui ajuan ini. */}
      <div className="border-t border-slate-200 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-red-600">
              Hapus Event
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Event tetap berjalan normal selama permintaan menunggu keputusan admin.
              Penghapusan diblokir kalau masih ada hutang fee.
            </p>
          </div>

          {pendingTypes.has("delete") ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              <Clock className="size-3.5" />
              Menunggu persetujuan admin
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => void requestDelete()}
              className="h-8 shrink-0 gap-1.5 border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600"
              title="Ajukan penghapusan event ke admin"
            >
              <Trash2 className="size-4" />
              {submitting ? "Mengirim..." : "Ajukan Hapus"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Riwayat Permintaan ────────────────────────────────────────────── */}
      <div className="border-t border-slate-200 p-5">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">Riwayat Permintaan</h3>
        </div>

        {requests.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            Belum ada permintaan perubahan untuk event ini.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType}
                  </span>
                  <StatusBadge status={r.status} />
                </div>

                {r.requestType === "delete" ? (
                  <p className="mt-1 text-sm text-red-600">
                    Permintaan hapus event secara permanen.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="text-slate-400 line-through">
                      {displayHistoryValue(r.requestType, r.oldValue)}
                    </span>
                    {" → "}
                    <strong className="text-slate-900">
                      {displayHistoryValue(r.requestType, r.newValue)}
                    </strong>
                  </p>
                )}

                <p className="mt-1 text-xs text-slate-400">
                  Diajukan {formatDateTime(r.createdAt)}
                  {r.reviewedAt ? ` · Diproses ${formatDateTime(r.reviewedAt)}` : ""}
                </p>

                {r.adminNote && (
                  <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <strong>Catatan admin:</strong> {r.adminNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: EventChangeRequest["status"] }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        <ShieldCheck className="size-3.5" />
        Disetujui
      </span>
    )
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
        <XCircle className="size-3.5" />
        Ditolak
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
      <Clock className="size-3.5" />
      Menunggu
    </span>
  )
}
