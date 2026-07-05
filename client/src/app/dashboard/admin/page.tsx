"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle, Clock, Phone, Mail, User, Ticket, XCircle } from "lucide-react"
import { useUser } from "@/hooks/useUser"

const API_BASE = "/api"
const getToken = () =>
  typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
})

interface PendingUser {
  id: string
  name: string
  email: string
  phone: string | null
  createdAt: string
}

interface StorefrontRequest {
  id: string
  title: string
  saleStartAt: string | null
  saleEndAt: string | null
  feeBearer: "audience" | "promotor" | null
  promotor: { name: string; email: string }
}

interface MerchRequest {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  variants: { id: string; size: string; stock: number }[]
  event: { title: string; promotor: { name: string; email: string } }
}

const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })

export default function AdminUsersPage() {
  const router = useRouter()
  const { user, loading: userLoading } = useUser()
  const [users, setUsers] = useState<PendingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [storefrontRequests, setStorefrontRequests] = useState<StorefrontRequest[]>([])
  const [loadingStorefront, setLoadingStorefront] = useState(true)
  const [processingEventId, setProcessingEventId] = useState<string | null>(null)
  const [rejectNoteFor, setRejectNoteFor] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState("")
  const [approvalEventId, setApprovalEventId] = useState<string | null>(null)
  const [ticketFee, setTicketFee] = useState(3.5)
  const [merchFee, setMerchFee] = useState(3.5)
  const [bundlingFee, setBundlingFee] = useState(3.5)

  const [merchRequests, setMerchRequests] = useState<MerchRequest[]>([])
  const [loadingMerch, setLoadingMerch] = useState(true)
  const [processingMerchId, setProcessingMerchId] = useState<string | null>(null)
  const [merchRejectFor, setMerchRejectFor] = useState<string | null>(null)
  const [merchRejectNote, setMerchRejectNote] = useState("")

  useEffect(() => {
    if (!userLoading && user && !user.isAdmin) {
      router.replace("/dashboard")
    }
  }, [user, userLoading, router])

  useEffect(() => {
    const token = getToken()
    if (!token) {
      router.replace("/login")
      return
    }
    fetchPendingUsers()
    fetchStorefrontRequests()
    fetchMerchRequests()
  }, [])

  if (userLoading) return <div className="py-16 text-center text-sm text-slate-400">Memuat...</div>
  if (!user?.isAdmin) return null

  async function fetchPendingUsers() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders() })
      if (res.status === 401) { router.replace("/login"); return }
      const json = await res.json()
      if (json.success) setUsers(json.data)
      else setError(json.message || "Gagal memuat data")
    } catch {
      setError("Tidak dapat menghubungi server.")
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(id: string) {
    setApprovingId(id)
    try {
      const res = await fetch(`${API_BASE}/admin/users/${id}/approve`, {
        method: "PATCH",
        headers: authHeaders(),
      })
      const json = await res.json()
      if (json.success) {
        setUsers((prev) => prev.filter((u) => u.id !== id))
      } else {
        alert(json.message || "Gagal approve user")
      }
    } catch {
      alert("Tidak dapat menghubungi server.")
    } finally {
      setApprovingId(null)
    }
  }

  async function fetchStorefrontRequests() {
    setLoadingStorefront(true)
    try {
      const res = await fetch(`${API_BASE}/admin/storefront-requests`, { headers: authHeaders() })
      const json = await res.json()
      if (json.success) setStorefrontRequests(json.data)
    } catch {}
    finally { setLoadingStorefront(false) }
  }

  async function handleApproveStorefront(eventId: string) {
    setProcessingEventId(eventId)
    try {
      const res = await fetch(`${API_BASE}/admin/storefront-requests/${eventId}/approve`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({
          ticketFeePercent: ticketFee,
          merchFeePercent: merchFee,
          bundlingFeePercent: bundlingFee,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setStorefrontRequests((prev) => prev.filter((e) => e.id !== eventId))
        setApprovalEventId(null)
      } else {
        alert(json.message || "Gagal menyetujui storefront")
      }
    } catch {
      alert("Tidak dapat menghubungi server.")
    } finally {
      setProcessingEventId(null)
    }
  }

  async function handleRejectStorefront(eventId: string) {
    setProcessingEventId(eventId)
    try {
      const res = await fetch(`${API_BASE}/admin/storefront-requests/${eventId}/reject`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ note: rejectNote }),
      })
      const json = await res.json()
      if (json.success) {
        setStorefrontRequests((prev) => prev.filter((e) => e.id !== eventId))
        setRejectNoteFor(null)
        setRejectNote("")
      } else {
        alert(json.message || "Gagal menolak storefront")
      }
    } catch {
      alert("Tidak dapat menghubungi server.")
    } finally {
      setProcessingEventId(null)
    }
  }

  async function fetchMerchRequests() {
    setLoadingMerch(true)
    try {
      const res = await fetch(`${API_BASE}/admin/merch-requests`, { headers: authHeaders() })
      const json = await res.json()
      if (json.success) setMerchRequests(json.data)
    } catch {}
    finally { setLoadingMerch(false) }
  }

  async function handleApproveMerch(id: string) {
    setProcessingMerchId(id)
    try {
      const res = await fetch(`${API_BASE}/admin/merch-requests/${id}/approve`, {
        method: "PATCH",
        headers: authHeaders(),
      })
      const json = await res.json()
      if (json.success) setMerchRequests((prev) => prev.filter((m) => m.id !== id))
      else alert(json.message || "Gagal menyetujui merchandise")
    } catch {
      alert("Tidak dapat menghubungi server.")
    } finally {
      setProcessingMerchId(null)
    }
  }

  async function handleRejectMerch(id: string) {
    setProcessingMerchId(id)
    try {
      const res = await fetch(`${API_BASE}/admin/merch-requests/${id}/reject`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ note: merchRejectNote }),
      })
      const json = await res.json()
      if (json.success) {
        setMerchRequests((prev) => prev.filter((m) => m.id !== id))
        setMerchRejectFor(null)
        setMerchRejectNote("")
      } else {
        alert(json.message || "Gagal menolak merchandise")
      }
    } catch {
      alert("Tidak dapat menghubungi server.")
    } finally {
      setProcessingMerchId(null)
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Approve User</h1>
        <p className="mt-1 text-sm text-slate-500">
          User yang baru mendaftar dan menunggu aktivasi akun.
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Memuat data...</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <CheckCircle className="mx-auto mb-3 size-10 text-emerald-500" />
          <p className="text-sm font-medium text-slate-700">Tidak ada user pending</p>
          <p className="mt-1 text-xs text-slate-400">Semua pendaftar sudah diproses.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-slate-500">Nama</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-500">Email</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-500">WhatsApp</th>
                  <th className="px-5 py-3 text-left font-medium text-slate-500">Waktu Daftar</th>
                  <th className="px-5 py-3 text-right font-medium text-slate-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-900">{user.name}</td>
                    <td className="px-5 py-4 text-slate-600">{user.email}</td>
                    <td className="px-5 py-4 text-slate-600">
                      {user.phone ? (
                        <a
                          href={`https://wa.me/${user.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-700 hover:underline"
                        >
                          {user.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-500">{formatDate(user.createdAt)}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => handleApprove(user.id)}
                        disabled={approvingId === user.id}
                        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                      >
                        <CheckCircle className="size-3.5" />
                        {approvingId === user.id ? "Memproses..." : "Approve"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-slate-100 md:hidden">
            {users.map((user) => (
              <div key={user.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <User className="size-4 shrink-0 text-slate-400" />
                    <span className="font-medium text-slate-900">{user.name}</span>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="size-3" />
                    {formatDate(user.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Mail className="size-3.5 shrink-0" />
                  {user.email}
                </div>
                {user.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="size-3.5 shrink-0 text-slate-400" />
                    <a
                      href={`https://wa.me/${user.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 hover:underline"
                    >
                      {user.phone}
                    </a>
                  </div>
                )}
                <button
                  onClick={() => handleApprove(user.id)}
                  disabled={approvingId === user.id}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                >
                  <CheckCircle className="size-4" />
                  {approvingId === user.id ? "Memproses..." : "Approve User"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Persetujuan Storefront */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Persetujuan Storefront</h2>
        <p className="mt-1 text-sm text-slate-500">
          Event yang mengajukan izin jual tiket publik lewat nexEvent.
        </p>
      </div>

      {loadingStorefront ? (
        <div className="py-16 text-center text-sm text-slate-400">Memuat data...</div>
      ) : storefrontRequests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <Ticket className="mx-auto mb-3 size-10 text-emerald-500" />
          <p className="text-sm font-medium text-slate-700">Tidak ada pengajuan storefront</p>
          <p className="mt-1 text-xs text-slate-400">Semua pengajuan sudah diproses.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {storefrontRequests.map((ev) => (
            <div key={ev.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{ev.title}</p>
                  <p className="text-sm text-slate-500">{ev.promotor.name} · {ev.promotor.email}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Jual: {ev.saleStartAt ? formatDate(ev.saleStartAt) : "-"} s/d {ev.saleEndAt ? formatDate(ev.saleEndAt) : "-"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => { setApprovalEventId(approvalEventId === ev.id ? null : ev.id); setTicketFee(3.5); setMerchFee(3.5); setBundlingFee(3.5) }}
                    disabled={processingEventId === ev.id}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                  >
                    <CheckCircle className="size-3.5" />
                    Setujui
                  </button>
                  <button
                    onClick={() => setRejectNoteFor(rejectNoteFor === ev.id ? null : ev.id)}
                    disabled={processingEventId === ev.id}
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                  >
                    <XCircle className="size-3.5" />
                    Tolak
                  </button>
                </div>
              </div>
              {approvalEventId === ev.id && (
                <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm font-medium text-slate-800">Set biaya layanan per tipe transaksi:</p>
                  <div className="space-y-2">
                    {([
                      ["Fee Tiket", ticketFee, setTicketFee],
                      ["Fee Merchandise", merchFee, setMerchFee],
                      ["Fee Bundling", bundlingFee, setBundlingFee],
                    ] as [string, number, (v: number) => void][]).map(([label, value, setter]) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">{label}</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            max="5"
                            step="0.5"
                            value={value}
                            onChange={(e) => setter(Number(e.target.value))}
                            className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                          />
                          <span className="text-sm text-slate-400">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400">Standar: 3.5% | Min: 1% | Maks: 5%</p>
                  <p className="text-xs text-amber-600">
                    Fee bearer dipilih promotor: {ev.feeBearer === "audience" ? "Penonton" : ev.feeBearer === "promotor" ? "Promotor" : "Belum dipilih"}
                  </p>
                  <button
                    onClick={() => handleApproveStorefront(ev.id)}
                    disabled={
                      processingEventId === ev.id ||
                      [ticketFee, merchFee, bundlingFee].some((f) => !Number.isFinite(f) || f < 1 || f > 5)
                    }
                    className="w-full rounded-xl bg-emerald-800 py-2 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-50"
                  >
                    {processingEventId === ev.id ? "Memproses..." : "Setujui Storefront"}
                  </button>
                </div>
              )}
              {rejectNoteFor === ev.id && (
                <div className="flex items-center gap-2">
                  <input
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Alasan penolakan (opsional)"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200"
                  />
                  <button
                    onClick={() => handleRejectStorefront(ev.id)}
                    disabled={processingEventId === ev.id}
                    className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {processingEventId === ev.id ? "Memproses..." : "Konfirmasi Tolak"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Persetujuan Merchandise */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Persetujuan Merchandise</h2>
        <p className="mt-1 text-sm text-slate-500">
          Produk merchandise yang menunggu review sebelum tampil di storefront publik.
        </p>
      </div>

      {loadingMerch ? (
        <div className="py-16 text-center text-sm text-slate-400">Memuat data...</div>
      ) : merchRequests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <CheckCircle className="mx-auto mb-3 size-10 text-emerald-500" />
          <p className="text-sm font-medium text-slate-700">Tidak ada merchandise pending</p>
          <p className="mt-1 text-xs text-slate-400">Semua produk sudah diproses.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {merchRequests.map((m) => (
            <div key={m.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  {m.imageUrl ? (
                    <img src={m.imageUrl} alt={m.name} className="size-14 shrink-0 rounded-lg border border-slate-200 object-cover" />
                  ) : (
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[10px] text-slate-300">
                      No foto
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{m.name}</p>
                    <p className="text-sm font-semibold text-emerald-700">{IDR.format(m.price)}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Size: {m.variants.map((v) => `${v.size} (${v.stock})`).join(", ")}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {m.event.title} · {m.event.promotor.name}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => handleApproveMerch(m.id)}
                    disabled={processingMerchId === m.id}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                  >
                    <CheckCircle className="size-3.5" />
                    {processingMerchId === m.id ? "Memproses..." : "Setujui"}
                  </button>
                  <button
                    onClick={() => setMerchRejectFor(merchRejectFor === m.id ? null : m.id)}
                    disabled={processingMerchId === m.id}
                    className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                  >
                    <XCircle className="size-3.5" />
                    Tolak
                  </button>
                </div>
              </div>
              {merchRejectFor === m.id && (
                <div className="flex items-center gap-2">
                  <input
                    value={merchRejectNote}
                    onChange={(e) => setMerchRejectNote(e.target.value)}
                    placeholder="Alasan penolakan (opsional)"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200"
                  />
                  <button
                    onClick={() => handleRejectMerch(m.id)}
                    disabled={processingMerchId === m.id}
                    className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {processingMerchId === m.id ? "Memproses..." : "Konfirmasi Tolak"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
