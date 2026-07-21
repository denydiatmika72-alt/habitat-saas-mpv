"use client"

// ============================================================================
// AdminChangeRequests — panel admin untuk Permintaan Perubahan Event (2026-07-21).
// ----------------------------------------------------------------------------
// Gerbang persetujuan untuk 5 field terkunci + HAPUS EVENT. Untuk permintaan
// hapus, backend ikut mengirim `deleteImpact` (hutang fee cash event, pencairan
// pending promotor, order tiket berbayar) supaya admin bisa memutuskan TANPA
// pindah halaman — itu yang menutup celah "hapus event untuk kabur dari hutang".
//
// Dipisah dari admin/page.tsx (sudah ~1500 baris) dan dirender sebagai satu seksi.
// ============================================================================

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle, CalendarX, CheckCircle, ClipboardList, Clock, ShieldCheck, XCircle,
} from "lucide-react"

const API_BASE = "/api"
const authHeaders = (): HeadersInit => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("token") : ""}`,
})

const REQUEST_TYPE_LABELS: Record<string, string> = {
  delete: "Hapus Event (permanen)",
  rename: "Nama Event",
  venue_location: "Lokasi Venue",
  venue_capacity: "Kapasitas Venue",
  target_profit: "Target Profit",
  target_sponsor: "Target Sponsor",
}

// Field bernilai uang → ditampilkan sebagai rupiah pada baris old → new.
const CURRENCY_TYPES = new Set(["target_profit", "target_sponsor"])

interface DeleteImpact {
  feeDebt: { totalDebt: number; orderCount: number }
  pendingPayout: { count: number; totalAmount: number }
  paidOrders: { count: number; totalAmount: number }
}

interface ChangeRequestRow {
  id: string
  eventId: string | null
  eventTitle: string
  requestType: string
  oldValue: string | null
  newValue: string | null
  status: "pending" | "approved" | "rejected"
  adminNote: string | null
  reviewedAt: string | null
  createdAt: string
  promotor?: { id: string; name: string; email: string } | null
  reviewer?: { id: string; name: string; email: string } | null
  deleteImpact?: DeleteImpact
}

function formatIDR(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value))
}

function formatValue(requestType: string, raw: string | null): string {
  if (raw === null || raw === undefined || raw === "") return "—"
  if (CURRENCY_TYPES.has(requestType)) return formatIDR(Number(raw))
  if (requestType === "venue_capacity") return Number(raw).toLocaleString("id-ID")
  return raw
}

export function AdminChangeRequests() {
  const [requests, setRequests] = useState<ChangeRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending")
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectFor, setRejectFor] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [error, setError] = useState<string | null>(null)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/admin/change-requests?status=${statusFilter}`, {
        headers: authHeaders(),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || "Gagal memuat permintaan.")
      setRequests(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat permintaan.")
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void fetchRequests()
  }, [fetchRequests])

  async function act(id: string, action: "approve" | "reject", note?: string) {
    setProcessingId(id)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/admin/change-requests/${id}/${action}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ adminNote: note || undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.message || "Gagal memproses permintaan.")
      setRejectFor(null)
      setRejectNote("")
      await fetchRequests()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses permintaan.")
    } finally {
      setProcessingId(null)
    }
  }

  function confirmApprove(row: ChangeRequestRow) {
    if (row.requestType === "delete") {
      const impact = row.deleteImpact
      const warn = impact
        ? `\n\nHutang fee cash: ${formatIDR(impact.feeDebt.totalDebt)} (${impact.feeDebt.orderCount} order)` +
          `\nPencairan pending: ${impact.pendingPayout.count} (${formatIDR(impact.pendingPayout.totalAmount)})` +
          `\nOrder tiket berbayar: ${impact.paidOrders.count} (${formatIDR(impact.paidOrders.totalAmount)})`
        : ""
      if (
        !confirm(
          `HAPUS PERMANEN event "${row.eventTitle}" beserta seluruh data turunannya?${warn}\n\nTindakan ini tidak bisa dibatalkan.`
        )
      )
        return
    }
    void act(row.id, "approve")
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Permintaan Perubahan Event</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pengajuan promotor untuk mengubah data event terkunci atau menghapus event.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {(["pending", "all"] as const).map((value) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === value
                  ? "bg-emerald-800 text-white"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {value === "pending" ? "Menunggu" : "Semua"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Memuat data...</div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <ClipboardList className="mx-auto mb-3 size-10 text-emerald-500" />
          <p className="text-sm font-medium text-slate-700">
            {statusFilter === "pending" ? "Tidak ada permintaan menunggu" : "Belum ada permintaan"}
          </p>
          <p className="mt-1 text-xs text-slate-400">Semua pengajuan sudah diproses.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((row) => {
            const isDelete = row.requestType === "delete"
            const isPending = row.status === "pending"
            const busy = processingId === row.id

            return (
              <div
                key={row.id}
                className={`rounded-xl border bg-white p-5 ${
                  isDelete && isPending ? "border-red-200" : "border-slate-200"
                }`}
              >
                {/* Header baris */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isDelete ? (
                        <CalendarX className="size-4 shrink-0 text-red-500" />
                      ) : (
                        <ClipboardList className="size-4 shrink-0 text-slate-400" />
                      )}
                      <span className="font-medium text-slate-900">{row.eventTitle}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {row.promotor?.name || "-"}{" "}
                      <span className="text-slate-400">({row.promotor?.email || "-"})</span>
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>

                {/* Detail perubahan */}
                <div className="mt-3 rounded-lg bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    {REQUEST_TYPE_LABELS[row.requestType] ?? row.requestType}
                  </p>
                  {isDelete ? (
                    <p className="mt-1 text-sm font-semibold text-red-600">
                      Hapus permanen event beserta seluruh data turunannya.
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-slate-700">
                      <span className="text-slate-400 line-through">
                        {formatValue(row.requestType, row.oldValue)}
                      </span>
                      {" → "}
                      <strong className="text-slate-900">
                        {formatValue(row.requestType, row.newValue)}
                      </strong>
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    Diajukan {formatDateTime(row.createdAt)}
                    {row.reviewedAt
                      ? ` · Diproses ${formatDateTime(row.reviewedAt)} oleh ${row.reviewer?.name || "admin"}`
                      : ""}
                  </p>
                </div>

                {/* Ringkasan dampak — hanya untuk permintaan hapus yang masih pending */}
                {row.deleteImpact && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-center gap-2 text-amber-800">
                      <AlertTriangle className="size-4" />
                      <p className="text-sm font-semibold">Periksa sebelum menyetujui</p>
                    </div>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                      <ImpactStat
                        label="Hutang fee cash (event ini)"
                        value={formatIDR(row.deleteImpact.feeDebt.totalDebt)}
                        sub={`${row.deleteImpact.feeDebt.orderCount} order`}
                        danger={row.deleteImpact.feeDebt.totalDebt > 0}
                      />
                      <ImpactStat
                        label="Pencairan pending (promotor)"
                        value={formatIDR(row.deleteImpact.pendingPayout.totalAmount)}
                        sub={`${row.deleteImpact.pendingPayout.count} pengajuan`}
                        danger={row.deleteImpact.pendingPayout.count > 0}
                      />
                      <ImpactStat
                        label="Order tiket berbayar"
                        value={formatIDR(row.deleteImpact.paidOrders.totalAmount)}
                        sub={`${row.deleteImpact.paidOrders.count} order`}
                        danger={row.deleteImpact.paidOrders.count > 0}
                      />
                    </dl>
                    <p className="mt-3 text-xs text-amber-800">
                      Menyetujui akan menghapus data ini secara permanen. Hutang fee yang belum lunas
                      akan ikut hilang bersama order-nya.
                    </p>
                  </div>
                )}

                {row.adminNote && (
                  <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <strong>Catatan admin:</strong> {row.adminNote}
                  </p>
                )}

                {/* Aksi */}
                {isPending && (
                  <div className="mt-4">
                    {rejectFor === row.id ? (
                      <div className="space-y-2">
                        <label htmlFor={`note-${row.id}`} className="block text-xs font-medium text-slate-600">
                          Alasan penolakan (opsional)
                        </label>
                        <textarea
                          id={`note-${row.id}`}
                          value={rejectNote}
                          onChange={(e) => setRejectNote(e.target.value)}
                          rows={2}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                          placeholder="Contoh: kapasitas venue melebihi izin yang terdaftar."
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => void act(row.id, "reject", rejectNote)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                          >
                            <XCircle className="size-3.5" />
                            {busy ? "Memproses..." : "Konfirmasi Tolak"}
                          </button>
                          <button
                            onClick={() => { setRejectFor(null); setRejectNote("") }}
                            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => confirmApprove(row)}
                          disabled={busy}
                          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
                            isDelete ? "bg-red-600 hover:bg-red-700" : "bg-emerald-800 hover:bg-emerald-900"
                          }`}
                        >
                          <CheckCircle className="size-3.5" />
                          {busy ? "Memproses..." : isDelete ? "Setujui & Hapus Event" : "Setujui & Terapkan"}
                        </button>
                        <button
                          onClick={() => { setRejectFor(row.id); setRejectNote("") }}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          <XCircle className="size-3.5" />
                          Tolak
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function ImpactStat({
  label, value, sub, danger,
}: { label: string; value: string; sub: string; danger: boolean }) {
  return (
    <div className="rounded-md border border-amber-200 bg-white px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-500">{label}</dt>
      <dd className={`mt-1 text-sm font-semibold ${danger ? "text-red-600" : "text-slate-900"}`}>
        {value}
      </dd>
      <dd className="text-[11px] text-slate-400">{sub}</dd>
    </div>
  )
}

function StatusBadge({ status }: { status: ChangeRequestRow["status"] }) {
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
