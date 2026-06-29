'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Clock, CheckCircle, ShieldOff, Calendar, LogOut } from 'lucide-react'

const API_URL = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api`

interface User {
  id: string
  name: string
  email: string
  status: string
  createdAt: string
}

interface Stats {
  totalUsers: number
  pendingUsers: number
  activeUsers: number
  suspendedUsers: number
  totalEvents: number
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:    'bg-emerald-100 text-emerald-800',
    pending:   'bg-amber-100 text-amber-800',
    suspended: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [tab, setTab] = useState<'pending' | 'all'>('pending')
  const [filterStatus, setFilterStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const authHeaders = () => {
    const token = localStorage.getItem('token')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  }

  const fetchStats = useCallback(async () => {
    const res = await fetch(`${API_URL}/admin/stats`, { headers: authHeaders() })
    if (res.status === 401 || res.status === 403) { router.replace('/'); return }
    const d = await res.json()
    if (d.success) setStats(d.data)
  }, [router])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const url = tab === 'pending'
        ? `${API_URL}/admin/users/pending`
        : `${API_URL}/admin/users${filterStatus ? `?status=${filterStatus}` : ''}`
      const res = await fetch(url, { headers: authHeaders() })
      if (res.status === 401 || res.status === 403) { router.replace('/'); return }
      const d = await res.json()
      if (d.success) setUsers(d.data)
    } finally {
      setLoading(false)
    }
  }, [tab, filterStatus, router])

  useEffect(() => {
    const checkAdmin = async () => {
      const token = localStorage.getItem('token')
      if (!token) { router.replace('/'); return }

      try {
        const res = await fetch(`${API_URL}/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.status === 401 || res.status === 403) { router.replace('/'); return }
        if (res.ok) {
          const d = await res.json()
          if (d.success) setStats(d.data)
          setAuthorized(true)
        } else {
          router.replace('/')
        }
      } catch {
        router.replace('/')
      } finally {
        setCheckingAuth(false)
      }
    }
    checkAdmin()
  }, [router])

  useEffect(() => {
    if (authorized) fetchUsers()
  }, [fetchUsers, authorized])

  const handleApprove = async (id: string) => {
    setActionLoading(id + '_approve')
    try {
      const res = await fetch(`${API_URL}/admin/users/${id}/approve`, {
        method: 'PATCH',
        headers: authHeaders(),
      })
      const d = await res.json()
      if (d.success) { await Promise.all([fetchStats(), fetchUsers()]) }
      else alert(d.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleSuspend = async (id: string) => {
    if (!confirm('Yakin suspend akun ini?')) return
    setActionLoading(id + '_suspend')
    try {
      const res = await fetch(`${API_URL}/admin/users/${id}/suspend`, {
        method: 'PATCH',
        headers: authHeaders(),
      })
      const d = await res.json()
      if (d.success) { await Promise.all([fetchStats(), fetchUsers()]) }
      else alert(d.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    router.push('/')
  }

  if (checkingAuth) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-500">Memuat admin panel...</p>
    </div>
  )

  if (!authorized) return null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Admin Panel</h1>
            <p className="text-xs text-slate-500">nexEvent User Management</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Dashboard
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100"
            >
              <LogOut className="size-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        {/* Stats Bar */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { label: 'Total User', value: stats?.totalUsers, icon: Users,       color: 'text-slate-700 bg-slate-100' },
            { label: 'Pending',    value: stats?.pendingUsers,   icon: Clock,       color: 'text-amber-700 bg-amber-100' },
            { label: 'Aktif',      value: stats?.activeUsers,    icon: CheckCircle, color: 'text-emerald-700 bg-emerald-100' },
            { label: 'Suspended',  value: stats?.suspendedUsers, icon: ShieldOff,   color: 'text-red-700 bg-red-100' },
            { label: 'Total Event',value: stats?.totalEvents,    icon: Calendar,    color: 'text-blue-700 bg-blue-100' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className={`mb-2 inline-flex size-9 items-center justify-center rounded-lg ${s.color}`}>
                <s.icon className="size-4" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value ?? '—'}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Table Section */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-200 px-4 pt-4">
            {([
              { key: 'pending', label: `Menunggu Aktivasi${stats?.pendingUsers ? ` (${stats.pendingUsers})` : ''}` },
              { key: 'all',     label: 'Semua User' },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setFilterStatus('') }}
                className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'border-b-2 border-emerald-700 text-emerald-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}

            {tab === 'all' && (
              <div className="ml-auto pb-2">
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="">Semua Status</option>
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Memuat data...</div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 text-4xl">{tab === 'pending' ? '🎉' : '👤'}</div>
                <p className="font-medium text-slate-700">
                  {tab === 'pending' ? 'Tidak ada user yang menunggu aktivasi.' : 'Tidak ada user ditemukan.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3 text-left">Nama</th>
                    <th className="px-6 py-3 text-left">Email</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-left">Daftar</th>
                    <th className="px-6 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50/60">
                      <td className="px-6 py-4 font-medium text-slate-900">{u.name}</td>
                      <td className="px-6 py-4 text-slate-500">{u.email}</td>
                      <td className="px-6 py-4"><StatusBadge status={u.status} /></td>
                      <td className="px-6 py-4 text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {u.status !== 'active' && (
                            <button
                              onClick={() => handleApprove(u.id)}
                              disabled={actionLoading === u.id + '_approve'}
                              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
                            >
                              {actionLoading === u.id + '_approve' ? 'Proses...' : 'Aktifkan'}
                            </button>
                          )}
                          {u.status !== 'suspended' && (
                            <button
                              onClick={() => handleSuspend(u.id)}
                              disabled={actionLoading === u.id + '_suspend'}
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
                            >
                              {actionLoading === u.id + '_suspend' ? 'Proses...' : 'Suspend'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
