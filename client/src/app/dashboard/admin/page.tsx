"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle, Clock, Phone, Mail, User } from "lucide-react"
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

export default function AdminUsersPage() {
  const router = useRouter()
  const { user, loading: userLoading } = useUser()
  const [users, setUsers] = useState<PendingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
    </div>
  )
}
