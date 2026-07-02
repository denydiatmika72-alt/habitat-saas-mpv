"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Lock, Ticket as TicketIcon, Plus, Trash2, Pencil, Copy, Check, ExternalLink } from "lucide-react"
import { useUser } from "@/hooks/useUser"

type Event = { id: string; title: string }

type FullEvent = {
  id: string
  title: string
  slug: string | null
  saleStartAt: string | null
  saleEndAt: string | null
  storefrontStatus: "draft" | "pending_approval" | "approved" | "rejected"
  storefrontNote: string | null
}

type TicketType = {
  id: string
  name: string
  description: string | null
  price: number
  quota: number
  sold: number
  isActive: boolean
}

type Order = {
  id: string
  orderId: string
  buyerName: string
  buyerEmail: string
  totalAmount: number
  status: string
  createdAt: string
  items: { quantity: number; ticketType: { name: string } }[]
}

const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })

const getToken = () => (typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "")
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" })

const STATUS_LABEL: Record<FullEvent["storefrontStatus"], { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  pending_approval: { label: "Menunggu Persetujuan", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Disetujui", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Ditolak", className: "bg-red-100 text-red-700" },
}

const ORDER_STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-700",
  expired: "bg-slate-100 text-slate-500",
  cancelled: "bg-red-100 text-red-700",
}

function toLocalInputValue(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TicketsPage() {
  const { isPro, loading: userLoading } = useUser()

  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState("")
  const [event, setEvent] = useState<FullEvent | null>(null)
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [newType, setNewType] = useState({ name: "", description: "", price: "", quota: "" })
  const [addingType, setAddingType] = useState(false)
  const [typeError, setTypeError] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ name: "", price: "", quota: "" })

  const [saleStart, setSaleStart] = useState("")
  const [saleEnd, setSaleEnd] = useState("")
  const [submittingApproval, setSubmittingApproval] = useState(false)
  const [approvalError, setApprovalError] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch("/api/events", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.success) setEvents(data.data) })
      .catch(() => {})
  }, [])

  const fetchDetail = useCallback(async () => {
    if (!selectedEventId) return
    setLoadingDetail(true)
    try {
      const [evRes, ttRes, ordRes] = await Promise.all([
        fetch(`/api/events/${selectedEventId}`, { headers: authHeaders() }),
        fetch(`/api/tickets/types?eventId=${selectedEventId}`, { headers: authHeaders() }),
        fetch(`/api/tickets/orders?eventId=${selectedEventId}`, { headers: authHeaders() }),
      ])
      const [evData, ttData, ordData] = await Promise.all([evRes.json(), ttRes.json(), ordRes.json()])
      if (evData.success) {
        setEvent(evData.data)
        setSaleStart(toLocalInputValue(evData.data.saleStartAt))
        setSaleEnd(toLocalInputValue(evData.data.saleEndAt))
      }
      if (ttData.success) setTicketTypes(ttData.data)
      if (ordData.success) setOrders(ordData.data)
    } catch {}
    finally { setLoadingDetail(false) }
  }, [selectedEventId])

  useEffect(() => {
    if (!isPro) return
    setEvent(null)
    setTicketTypes([])
    setOrders([])
    fetchDetail()
  }, [selectedEventId, isPro, fetchDetail])

  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault()
    setTypeError("")
    if (!newType.name || !newType.price || !newType.quota) return
    setAddingType(true)
    try {
      const res = await fetch("/api/tickets/types", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          eventId: selectedEventId,
          name: newType.name,
          description: newType.description || undefined,
          price: Number(newType.price),
          quota: Number(newType.quota),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setTicketTypes((prev) => [...prev, data.data])
        setNewType({ name: "", description: "", price: "", quota: "" })
      } else {
        setTypeError(data.message || "Gagal menambah jenis tiket.")
      }
    } catch {
      setTypeError("Gagal menghubungi server.")
    } finally {
      setAddingType(false)
    }
  }

  const startEdit = (tt: TicketType) => {
    setEditingId(tt.id)
    setEditDraft({ name: tt.name, price: String(tt.price), quota: String(tt.quota) })
  }

  const saveEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/tickets/types/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ name: editDraft.name, price: Number(editDraft.price), quota: Number(editDraft.quota) }),
      })
      const data = await res.json()
      if (data.success) {
        setTicketTypes((prev) => prev.map((t) => (t.id === id ? data.data : t)))
        setEditingId(null)
      } else {
        alert(data.message || "Gagal menyimpan perubahan.")
      }
    } catch {
      alert("Gagal menghubungi server.")
    }
  }

  const toggleActive = async (tt: TicketType) => {
    const res = await fetch(`/api/tickets/types/${tt.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ isActive: !tt.isActive }),
    })
    const data = await res.json()
    if (data.success) setTicketTypes((prev) => prev.map((t) => (t.id === tt.id ? data.data : t)))
  }

  const deleteType = async (id: string) => {
    if (!confirm("Hapus jenis tiket ini?")) return
    const res = await fetch(`/api/tickets/types/${id}`, { method: "DELETE", headers: authHeaders() })
    const data = await res.json()
    if (data.success) setTicketTypes((prev) => prev.filter((t) => t.id !== id))
    else alert(data.message || "Gagal menghapus jenis tiket.")
  }

  const requestApproval = async () => {
    setApprovalError("")
    if (!saleStart || !saleEnd) {
      setApprovalError("Tanggal mulai dan selesai jual wajib diisi.")
      return
    }
    setSubmittingApproval(true)
    try {
      const res = await fetch("/api/tickets/request-approval", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          eventId: selectedEventId,
          saleStartAt: new Date(saleStart).toISOString(),
          saleEndAt: new Date(saleEnd).toISOString(),
        }),
      })
      const data = await res.json()
      if (data.success) setEvent(data.data)
      else setApprovalError(data.message || "Gagal mengajukan persetujuan.")
    } catch {
      setApprovalError("Gagal menghubungi server.")
    } finally {
      setSubmittingApproval(false)
    }
  }

  const storefrontUrl = event?.slug ? `nexeventapp.tech/event/${event.slug}` : ""
  const copyUrl = () => {
    navigator.clipboard.writeText(`https://${storefrontUrl}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
      </div>
    )
  }

  if (!isPro) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex items-start gap-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
            <TicketIcon className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manajemen Tiket</h1>
            <p className="mt-0.5 text-sm text-slate-500">Jual tiket event langsung ke penonton lewat storefront publik nexEvent.</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-emerald-50">
            <Lock className="size-7 text-emerald-800" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">🔒 Fitur Pro</p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
              Ticketing Storefront tersedia untuk pengguna Pro. Upgrade untuk mulai jual tiket online.
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
          <TicketIcon className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manajemen Tiket</h1>
          <p className="mt-0.5 text-sm text-slate-500">Jual tiket event langsung ke penonton lewat storefront publik nexEvent.</p>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Pilih Event</label>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="max-w-sm truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
        >
          <option value="">-- Pilih event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.title}</option>
          ))}
        </select>
      </div>

      {!selectedEventId && (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center">
          <TicketIcon className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm text-slate-400">Pilih event untuk mengelola tiket.</p>
        </div>
      )}

      {selectedEventId && loadingDetail && !event && (
        <div className="flex justify-center py-14">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
        </div>
      )}

      {selectedEventId && event && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left column: ticket types + storefront settings */}
          <div className="flex flex-col gap-6 lg:col-span-3">
            {/* Ticket types */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-slate-900">Jenis Tiket</p>

              {ticketTypes.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Belum ada jenis tiket.</p>
              ) : (
                <ul className="mb-4 flex flex-col gap-2">
                  {ticketTypes.map((tt) => (
                    <li key={tt.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      {editingId === tt.id ? (
                        <div className="flex flex-col gap-2">
                          <input
                            value={editDraft.name}
                            onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                          />
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={editDraft.price}
                              onChange={(e) => setEditDraft((d) => ({ ...d, price: e.target.value }))}
                              placeholder="Harga"
                              className="w-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                            />
                            <input
                              type="number"
                              value={editDraft.quota}
                              onChange={(e) => setEditDraft((d) => ({ ...d, quota: e.target.value }))}
                              placeholder="Kuota"
                              className="w-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => saveEdit(tt.id)} className="flex-1 rounded-lg bg-emerald-800 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900">Simpan</button>
                            <button onClick={() => setEditingId(null)} className="flex-1 rounded-lg bg-slate-200 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300">Batal</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">{tt.name}</p>
                              {!tt.isActive && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">Nonaktif</span>}
                            </div>
                            <p className="text-xs text-slate-500">{IDR.format(tt.price)} · {tt.sold}/{tt.quota} terjual</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => toggleActive(tt)}
                              className="rounded-md px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-200"
                            >
                              {tt.isActive ? "Nonaktifkan" : "Aktifkan"}
                            </button>
                            <button onClick={() => startEdit(tt)} className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                              <Pencil className="size-3.5" />
                            </button>
                            <button onClick={() => deleteType(tt.id)} className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500">
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={handleAddType} className="flex flex-col gap-2 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium text-slate-500">Tambah Jenis Tiket</p>
                <input
                  value={newType.name}
                  onChange={(e) => setNewType((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Nama (Regular, VIP, ...)"
                  required
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
                <input
                  value={newType.description}
                  onChange={(e) => setNewType((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Deskripsi (opsional)"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={newType.price}
                    onChange={(e) => setNewType((d) => ({ ...d, price: e.target.value }))}
                    placeholder="Harga (Rp)"
                    required
                    min={0}
                    className="w-1/2 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                  <input
                    type="number"
                    value={newType.quota}
                    onChange={(e) => setNewType((d) => ({ ...d, quota: e.target.value }))}
                    placeholder="Kuota"
                    required
                    min={1}
                    className="w-1/2 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                </div>
                {typeError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{typeError}</p>}
                <button
                  type="submit"
                  disabled={addingType}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-800 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                >
                  <Plus className="size-4" /> {addingType ? "Menambahkan..." : "Tambah Jenis Tiket"}
                </button>
              </form>
            </div>

            {/* Storefront settings */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Pengaturan Storefront</p>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_LABEL[event.storefrontStatus].className}`}>
                  {STATUS_LABEL[event.storefrontStatus].label}
                </span>
              </div>

              {event.storefrontStatus === "rejected" && event.storefrontNote && (
                <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  <span className="font-semibold">Catatan admin:</span> {event.storefrontNote}
                </div>
              )}

              {event.storefrontStatus === "approved" && event.slug ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5">
                  <ExternalLink className="size-4 shrink-0 text-emerald-700" />
                  <a href={`https://${storefrontUrl}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-800 hover:underline">
                    {storefrontUrl}
                  </a>
                  <button onClick={copyUrl} className="flex size-7 shrink-0 items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-100">
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Mulai Jual Tiket</label>
                    <input
                      type="datetime-local"
                      value={saleStart}
                      onChange={(e) => setSaleStart(e.target.value)}
                      disabled={event.storefrontStatus === "pending_approval"}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Selesai Jual Tiket</label>
                    <input
                      type="datetime-local"
                      value={saleEnd}
                      onChange={(e) => setSaleEnd(e.target.value)}
                      disabled={event.storefrontStatus === "pending_approval"}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  {approvalError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{approvalError}</p>}
                  {event.storefrontStatus === "pending_approval" ? (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Menunggu review admin nexEvent.</p>
                  ) : (
                    <button
                      onClick={requestApproval}
                      disabled={submittingApproval}
                      className="rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                    >
                      {submittingApproval ? "Mengajukan..." : "Ajukan Persetujuan"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right column: orders */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-slate-900">Pesanan ({orders.length})</p>
              {orders.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Belum ada pesanan.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {orders.map((o) => (
                    <li key={o.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{o.buyerName}</p>
                          <p className="truncate text-xs text-slate-500">{o.buyerEmail}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {o.items.map((i) => `${i.ticketType.name}×${i.quantity}`).join(", ")}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-slate-900">{IDR.format(o.totalAmount)}</p>
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${ORDER_STATUS_BADGE[o.status] || "bg-slate-100 text-slate-500"}`}>
                            {o.status}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        {new Date(o.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
