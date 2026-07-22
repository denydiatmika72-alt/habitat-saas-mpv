"use client"

import { useEffect, useState, useCallback } from "react"
import { Plus, Trash2, RotateCw, ChevronDown, Check, X, PackageOpen, Eye, FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ProLockPanel } from "@/components/dashboard/pro-lock"

// ─── Types ────────────────────────────────────────────────────────────────────

type RabItem = {
  id: string
  name: string
  qty: number
  hargaSatuan: number
  estimatedCost: number
  categoryName: string
}

type POItem = {
  _key: string              // client-side only
  name: string
  qty: number
  unitPrice: number
  _unitPriceDisplay: string // client-side only, formatted with dots
  totalPrice: number
  sourceRabItemId?: string | null
}

type PO = {
  id: string
  title: string
  status: string
  totalAmount: number
  notes: string | null
  createdAt: string
  items: {
    id: string
    name: string
    qty: number
    unitPrice: number
    totalPrice: number
    sourceRabItemId: string | null
  }[]
}

type Event = {
  id: string
  title: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API_BASE = "/api"
const getToken = () => (typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "")
const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
})

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

function formatRupiah(value: string): string {
  const digits = value.replace(/\D/g, "")
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

function parseRupiah(value: string): number {
  return Number(value.replace(/\./g, "")) || 0
}

function statusBadge(status: string) {
  if (status === "paid") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (status === "sent") return "bg-blue-100 text-blue-700 border-blue-200"
  return "bg-slate-100 text-slate-600 border-slate-200"
}

function statusLabel(status: string) {
  if (status === "paid") return "Paid"
  if (status === "sent") return "Sent"
  return "Draft"
}

let keyCounter = 0
function newKey() {
  return `item_${++keyCounter}`
}

function emptyItem(): POItem {
  return { _key: newKey(), name: "", qty: 1, unitPrice: 0, _unitPriceDisplay: "", totalPrice: 0, sourceRabItemId: null }
}

// ─── Sub-component: RAB Import Modal ─────────────────────────────────────────

function RabImportModal({
  eventId,
  onConfirm,
  onClose,
}: {
  eventId: string
  onConfirm: (items: POItem[]) => void
  onClose: () => void
}) {
  const [rabItems, setRabItems] = useState<RabItem[]>([])
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    fetch(`${API_BASE}/events/${eventId}/rab-items`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setRabItems(json.data ?? [])
      })
      .finally(() => setLoading(false))
  }, [eventId])

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function confirmImport() {
    const selected = rabItems.filter((r) => checked.has(r.id))
    const items: POItem[] = selected.map((r) => ({
      _key: newKey(),
      name: r.name,
      qty: r.qty,
      unitPrice: r.hargaSatuan,
      _unitPriceDisplay: formatRupiah(String(r.hargaSatuan)),
      totalPrice: r.qty * r.hargaSatuan,
      sourceRabItemId: r.id,
    }))
    onConfirm(items)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <span className="font-semibold text-slate-800">Import dari RAB</span>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-5">
          {loading && (
            <div className="flex justify-center py-8">
              <RotateCw className="size-5 animate-spin text-slate-400" />
            </div>
          )}
          {!loading && rabItems.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">Tidak ada item RAB pada event ini.</p>
          )}
          {!loading && rabItems.length > 0 && (
            <div className="space-y-1.5">
              {rabItems.map((r) => (
                <button
                  key={r.id}
                  onClick={() => toggle(r.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-all",
                    checked.has(r.id)
                      ? "border-slate-800 bg-slate-900 text-white"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border",
                      checked.has(r.id) ? "border-white bg-white" : "border-slate-400"
                    )}
                  >
                    {checked.has(r.id) && <Check className="size-3 text-slate-900" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("truncate text-sm font-medium", checked.has(r.id) ? "text-white" : "text-slate-800")}>
                      {r.name}
                    </p>
                    <p className={cn("text-xs", checked.has(r.id) ? "text-slate-300" : "text-slate-500")}>
                      {r.categoryName} · {r.qty}× {IDR.format(r.hargaSatuan)}
                    </p>
                  </div>
                  <span className={cn("font-mono text-sm font-semibold", checked.has(r.id) ? "text-emerald-300" : "text-emerald-700")}>
                    {IDR.format(r.estimatedCost)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            className="bg-slate-900 hover:bg-slate-800"
            disabled={checked.size === 0}
            onClick={confirmImport}
          >
            Konfirmasi Import ({checked.size})
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-component: PO Detail Modal ──────────────────────────────────────────

function PODetailModal({ po, onClose }: { po: PO; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="font-semibold text-slate-800">{po.title}</p>
            <p className="text-xs text-slate-400">
              {new Date(po.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold", statusBadge(po.status))}>
              {statusLabel(po.status)}
            </span>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {po.notes && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {po.notes}
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="pb-2 text-left">Item</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Harga Satuan</th>
                <th className="pb-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((item, i) => (
                <tr key={item.id} className={cn("border-b border-slate-100", i % 2 === 0 ? "bg-slate-50/50" : "")}>
                  <td className="py-2 text-slate-700">{item.name}</td>
                  <td className="py-2 text-right text-slate-600">{item.qty}</td>
                  <td className="py-2 text-right text-slate-600">{IDR.format(item.unitPrice)}</td>
                  <td className="py-2 text-right font-semibold text-slate-900">{IDR.format(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-3 font-semibold text-slate-700">Total</td>
                <td className="pt-3 text-right font-bold text-emerald-700">{IDR.format(po.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PurchaseOrderTab({
  eventId: propEventId,
  // createSignal: counter dari luar (tombol "Buat PO" di header halaman
  // Perencanaan). Tiap kenaikan → buka modal Buat PO, lewat handler yang SAMA
  // dengan tombol "Buat PO Baru" internal — bukan jalur duplikat.
  createSignal = 0,
}: { eventId?: string | null; createSignal?: number }) {
  // Event selection (ketika tidak ada eventId dari props)
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string>(propEventId ?? "")

  // PO list
  const [pos, setPos] = useState<PO[]>([])
  const [loadingPos, setLoadingPos] = useState(false)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [formTitle, setFormTitle] = useState("")
  const [formNotes, setFormNotes] = useState("")
  const [formItems, setFormItems] = useState<POItem[]>([emptyItem()])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // RAB import modal
  const [showRabModal, setShowRabModal] = useState(false)

  // Detail modal
  const [detailPO, setDetailPO] = useState<PO | null>(null)

  // Deleting state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Downloading PDF state
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null)

  // PO dijaga requireActivePro PER-EVENT → 402 kalau event terpilih belum Pro.
  const [proLocked, setProLocked] = useState(false)

  // ── Load events kalau propEventId tidak diberikan ──────────────────────────
  useEffect(() => {
    if (propEventId) {
      setSelectedEventId(propEventId)
      return
    }
    fetch(`${API_BASE}/events`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setEvents(json.data ?? [])
      })
  }, [propEventId])

  // ── Load POs saat eventId berubah ─────────────────────────────────────────
  const loadPos = useCallback(async (evId: string) => {
    if (!evId) return
    setLoadingPos(true)
    setProLocked(false)
    const res = await fetch(`${API_BASE}/po?eventId=${evId}`, { headers: authHeaders() })
    // 402 = requireActivePro menolak (event ini belum Pro) → gembok, bukan "belum ada PO".
    if (res.status === 402) { setProLocked(true); setPos([]); setLoadingPos(false); return }
    const json = await res.json()
    if (json.success) setPos(json.data ?? [])
    setLoadingPos(false)
  }, [])

  useEffect(() => {
    if (selectedEventId) loadPos(selectedEventId)
  }, [selectedEventId, loadPos])

  // ── Buka form dari luar (createSignal) ────────────────────────────────────
  // Guard sama seperti tombol internal: butuh event terpilih & tidak Pro-locked.
  // Deps SENGAJA hanya createSignal — efek ini hanya bereaksi pada klik tombol
  // luar, bukan pada perubahan state lain.
  useEffect(() => {
    if (!createSignal) return
    if (!selectedEventId || proLocked) return
    resetForm()
    setShowForm(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSignal])

  // ── Form helpers ──────────────────────────────────────────────────────────

  function updateItem(key: string, field: "name" | "qty" | "unitPrice", raw: string) {
    setFormItems((prev) =>
      prev.map((item) => {
        if (item._key !== key) return item
        if (field === "unitPrice") {
          const digits = raw.replace(/\D/g, "")
          const numVal = parseRupiah(digits)
          const updated = { ...item, unitPrice: numVal, _unitPriceDisplay: formatRupiah(digits) }
          updated.totalPrice = updated.qty * updated.unitPrice
          return updated
        }
        const updated = { ...item, [field]: field === "name" ? raw : Number(raw) || 0 }
        updated.totalPrice = updated.qty * updated.unitPrice
        return updated
      })
    )
  }

  function removeItem(key: string) {
    setFormItems((prev) => prev.filter((i) => i._key !== key))
  }

  function importFromRab(imported: POItem[]) {
    const withDisplay = imported.map((i) => ({
      ...i,
      _unitPriceDisplay: formatRupiah(String(i.unitPrice)),
    }))
    setFormItems((prev) => [...prev, ...withDisplay])
  }

  function resetForm() {
    setFormTitle("")
    setFormNotes("")
    setFormItems([emptyItem()])
    setFormError(null)
  }

  const formTotal = formItems.reduce((s, i) => s + (i.totalPrice || 0), 0)

  // ── Save PO ───────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!formTitle.trim()) {
      setFormError("Judul PO wajib diisi.")
      return
    }
    const validItems = formItems.filter((i) => i.name.trim())
    if (validItems.length === 0) {
      setFormError("PO harus memiliki minimal 1 item.")
      return
    }
    for (const item of validItems) {
      if (item.qty <= 0 || item.unitPrice <= 0) {
        setFormError("Qty dan Harga Satuan harus lebih dari 0.")
        return
      }
    }

    setFormError(null)
    setSaving(true)

    const payload = {
      eventId: selectedEventId,
      vendorId: null,
      title: formTitle.trim(),
      notes: formNotes.trim() || null,
      items: validItems.map(({ name, qty, unitPrice, totalPrice, sourceRabItemId }) => ({
        name,
        qty,
        unitPrice,
        totalPrice,
        sourceRabItemId: sourceRabItemId ?? null,
      })),
    }

    const res = await fetch(`${API_BASE}/po`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    setSaving(false)

    if (!json.success) {
      setFormError(json.message || "Gagal menyimpan PO.")
      return
    }

    resetForm()
    setShowForm(false)
    loadPos(selectedEventId)
  }

  // ── Download PDF ──────────────────────────────────────────────────────────

  const downloadPOPdf = async (poId: string, poTitle: string) => {
    setDownloadingPdfId(poId)
    try {
      const token = localStorage.getItem('token')
                 || localStorage.getItem('accessToken')
                 || sessionStorage.getItem('token')

      const response = await fetch(
        `/api/po/${poId}/pdf`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }

      const blob = await response.blob()

      if (blob.size === 0) {
        throw new Error('File PDF kosong')
      }

      const url = window.URL.createObjectURL(
        new Blob([blob], { type: 'application/pdf' })
      )

      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.download = `PO-${poTitle.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`
      document.body.appendChild(a)
      a.click()

      setTimeout(() => {
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }, 100)

    } catch (error) {
      console.error('Download PDF gagal:', error)
      alert('Gagal mendownload PDF. Silakan coba lagi.')
    }
    setDownloadingPdfId(null)
  }

  // ── Delete PO ─────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!confirm("Hapus PO ini? Tindakan tidak bisa dibatalkan.")) return
    setDeletingId(id)
    await fetch(`${API_BASE}/po/${id}`, { method: "DELETE", headers: authHeaders() })
    setPos((prev) => prev.filter((p) => p.id !== id))
    setDeletingId(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Pilih Event — hanya tampil jika eventId tidak disuplai dari props */}
      {!propEventId && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Pilih Event
          </Label>
          <select
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
          >
            <option value="">— Pilih event —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* Event terpilih belum Pro (backend 402) → gembok + ajakan upgrade */}
      {selectedEventId && proLocked ? (
        <ProLockPanel
          eventId={selectedEventId}
          featureName="Purchase Order"
          description="Event ini belum aktif Pro. Pembuatan & pengelolaan Purchase Order khusus Pro — upgrade untuk membuka fitur ini untuk event terpilih."
        />
      ) : selectedEventId ? (
        <>
          {/* Tombol "Buat PO Baru" internal DIHAPUS 2026-07-22 — pembuatan PO
              kini lewat tombol "Buat PO" di baris aksi cepat header halaman
              Perencanaan (prop createSignal → handler yang sama). */}
          <p className="text-sm text-slate-500">{pos.length} Purchase Order tersimpan</p>

          {/* Daftar PO */}
          {loadingPos && (
            <div className="py-12 text-center">
              <RotateCw className="mx-auto size-5 animate-spin text-slate-400" />
            </div>
          )}

          {!loadingPos && pos.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400">
              <PackageOpen className="mx-auto mb-3 size-10 opacity-30" />
              <p className="font-medium">Belum ada Purchase Order.</p>
              <p className="mt-1 text-sm">Klik "Buat PO" di bagian atas halaman untuk memulai.</p>
            </div>
          )}

          <div className="space-y-3">
            {pos.map((po) => (
              <div key={po.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{po.title}</span>
                      <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold", statusBadge(po.status))}>
                        {statusLabel(po.status)}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-base font-bold text-emerald-700">{IDR.format(po.totalAmount)}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(po.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                      {po.notes && ` · ${po.notes.slice(0, 60)}${po.notes.length > 60 ? "…" : ""}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setDetailPO(po)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <Eye className="size-3.5" />
                      Detail
                    </button>
                    <button
                      onClick={() => downloadPOPdf(po.id, po.title)}
                      disabled={downloadingPdfId === po.id}
                      title="Unduh PDF"
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {downloadingPdfId === po.id
                        ? <RotateCw className="size-3.5 animate-spin" />
                        : <FileDown className="size-3.5" />
                      }
                    </button>
                    <button
                      onClick={() => handleDelete(po.id)}
                      disabled={deletingId === po.id}
                      className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50"
                    >
                      {deletingId === po.id
                        ? <RotateCw className="size-3.5 animate-spin" />
                        : <Trash2 className="size-3.5" />
                      }
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        !propEventId && (
          <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400">
            <ChevronDown className="mx-auto mb-3 size-8 opacity-30" />
            <p className="text-sm">Pilih event untuk melihat Purchase Order.</p>
          </div>
        )
      )}

      {/* ── Modal: Form Buat PO ──────────────────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10"
          onKeyDown={(e) => { if (e.key === 'Escape') { setShowForm(false); resetForm() } }}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <span className="font-semibold text-slate-800">Buat Purchase Order Baru</span>
              <button
                onClick={() => { setShowForm(false); resetForm() }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Error */}
              {formError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  <X className="size-4 shrink-0" />
                  {formError}
                </div>
              )}

              {/* Judul + Catatan */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Judul PO <span className="text-red-500">*</span></Label>
                  <Input
                    className="mt-1"
                    placeholder="cth. PO Sound System Hari H"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Catatan (opsional)</Label>
                  <Input
                    className="mt-1"
                    placeholder="Catatan tambahan..."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                  />
                </div>
              </div>

              {/* Daftar Item */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Daftar Item</Label>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setShowRabModal(true)}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      <Plus className="size-3.5" />
                      Import dari RAB
                    </button>
                    <button
                      onClick={() => setFormItems((p) => [...p, emptyItem()])}
                      className="flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                    >
                      <Plus className="size-3.5" />
                      Tambah Manual
                    </button>
                  </div>
                </div>

                {/* Header kolom */}
                <div className="grid grid-cols-12 gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <span className="col-span-5">Nama Item</span>
                  <span className="col-span-2 text-center">Qty</span>
                  <span className="col-span-3 text-right">Harga Satuan</span>
                  <span className="col-span-2 text-right">Total</span>
                </div>

                <div className="mt-1 space-y-1.5">
                  {formItems.map((item) => (
                    <div key={item._key} className="grid grid-cols-12 items-center gap-2">
                      <Input
                        className="col-span-5 h-8 text-sm"
                        placeholder="Nama item..."
                        value={item.name}
                        onChange={(e) => updateItem(item._key, "name", e.target.value)}
                      />
                      <Input
                        type="number"
                        min={0}
                        className="col-span-2 h-8 text-center text-sm"
                        value={item.qty || ""}
                        onChange={(e) => updateItem(item._key, "qty", e.target.value)}
                      />
                      <Input
                        type="text"
                        inputMode="numeric"
                        className="col-span-3 h-8 text-right text-sm"
                        placeholder="0"
                        value={item._unitPriceDisplay}
                        onChange={(e) => updateItem(item._key, "unitPrice", e.target.value)}
                      />
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <span className="text-right text-xs font-semibold text-slate-700 truncate">
                          {IDR.format(item.totalPrice)}
                        </span>
                        {formItems.length > 1 && (
                          <button
                            onClick={() => removeItem(item._key)}
                            className="ml-0.5 shrink-0 text-slate-300 hover:text-red-400"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Grand Total */}
                <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                  <span className="text-sm font-semibold text-slate-700">Total PO</span>
                  <span className="font-mono text-base font-bold text-emerald-700">{IDR.format(formTotal)}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm() }}>
                Batal
              </Button>
              <Button
                className="gap-2 bg-slate-900 hover:bg-slate-800"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <RotateCw className="size-4 animate-spin" /> : null}
                {saving ? "Menyimpan..." : "Simpan PO"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Import dari RAB */}
      {showRabModal && selectedEventId && (
        <RabImportModal
          eventId={selectedEventId}
          onConfirm={importFromRab}
          onClose={() => setShowRabModal(false)}
        />
      )}

      {/* Modal: Detail PO */}
      {detailPO && (
        <PODetailModal po={detailPO} onClose={() => setDetailPO(null)} />
      )}
    </div>
  )
}
