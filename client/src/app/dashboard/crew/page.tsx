"use client"

import { useEffect, useState } from "react"
import { Lock, Users, Plus, Trash2, ScanLine, Wallet } from "lucide-react"
import Link from "next/link"
import { useUser } from "@/hooks/useUser"
import { useSelectedEvent } from "@/contexts/event-context"
import { ProLockPanel } from "@/components/dashboard/pro-lock"

type Event = { id: string; title: string }

type Scanner = {
  scannerId: string
  name: string
  email: string
  assignedAt: string
}

type CrewMember = {
  accountId: string
  crewId: string
  name: string
  email: string
  division: string
}

const getToken = () =>
  typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
})

export default function CrewPage() {
  const { isPro, loading: userLoading } = useUser()

  const [events, setEvents] = useState<Event[]>([])
  // Event dari EventProvider (dipilih di Dashboard KPI) — state lokal DIHAPUS 2026-07-20.
  // Dropdown di halaman ini tetap ada, tapi menulis ke context yang SAMA.
  const { selectedEventId, setSelectedEventId } = useSelectedEvent()
  const [crew, setCrew] = useState<CrewMember[]>([])
  const [fetchingCrew, setFetchingCrew] = useState(false)
  // Pro dicek PER-EVENT di backend (402). Akun Pro untuk event lain lolos gate `isPro` global,
  // jadi 402 ditangani terpisah supaya tidak tampil sebagai "belum ada crew".
  const [proLocked, setProLocked] = useState(false)

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteDivision, setInviteDivision] = useState("")
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState("")

  // Scanner invite state
  const [scanners, setScanners] = useState<Scanner[]>([])
  const [fetchingScanners, setFetchingScanners] = useState(false)
  const [scannerEmail, setScannerEmail] = useState("")
  const [invitingScanner, setInvitingScanner] = useState(false)
  const [scannerError, setScannerError] = useState("")
  const [scannerSuccess, setScannerSuccess] = useState("")

  useEffect(() => {
    fetch("/api/events", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.success) setEvents(data.data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedEventId || !isPro) return
    setFetchingCrew(true)
    setProLocked(false)
    fetch(`/api/crew?eventId=${selectedEventId}`, { headers: authHeaders() })
      .then((r) => {
        if (r.status === 402) { setProLocked(true); return null }
        return r.ok ? r.json() : null
      })
      .then((data) => { if (data?.success) setCrew(data.crew) })
      .catch(() => {})
      .finally(() => setFetchingCrew(false))
  }, [selectedEventId, isPro])

  useEffect(() => {
    if (!selectedEventId || !isPro) return
    setScannerError("")
    setScannerSuccess("")
    setFetchingScanners(true)
    fetch(`/api/scanner/event/${selectedEventId}`, { headers: authHeaders() })
      .then((r) => {
        if (r.status === 402) { setProLocked(true); return null }
        return r.ok ? r.json() : null
      })
      .then((data) => { if (data?.success) setScanners(data.scanners) })
      .catch(() => {})
      .finally(() => setFetchingScanners(false))
  }, [selectedEventId, isPro])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError("")
    if (!inviteEmail || !inviteDivision || !selectedEventId) return
    setInviting(true)
    try {
      const res = await fetch("/api/crew/invite", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: inviteEmail, division: inviteDivision, eventId: selectedEventId }),
      })
      const data = await res.json()
      if (data.success) {
        setInviteEmail("")
        setInviteDivision("")
        // Refresh crew list
        const refresh = await fetch(`/api/crew?eventId=${selectedEventId}`, { headers: authHeaders() })
        const refreshData = await refresh.json()
        if (refreshData.success) setCrew(refreshData.crew)
      } else {
        setInviteError(data.message ?? "Gagal menambahkan crew.")
      }
    } catch {
      setInviteError("Gagal menghubungi server.")
    } finally {
      setInviting(false)
    }
  }

  const handleInviteScanner = async (e: React.FormEvent) => {
    e.preventDefault()
    setScannerError("")
    setScannerSuccess("")
    if (!scannerEmail || !selectedEventId) return
    setInvitingScanner(true)
    try {
      const res = await fetch("/api/scanner/invite", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: scannerEmail, eventId: selectedEventId }),
      })
      const data = await res.json()
      if (data.success) {
        setScannerEmail("")
        setScannerSuccess(`Scanner ${data.scanner?.name ?? ""} berhasil diundang.`)
        const refresh = await fetch(`/api/scanner/event/${selectedEventId}`, { headers: authHeaders() })
        const refreshData = await refresh.json()
        if (refreshData.success) setScanners(refreshData.scanners)
      } else {
        setScannerError(data.message ?? "Gagal mengundang scanner.")
      }
    } catch {
      setScannerError("Gagal menghubungi server.")
    } finally {
      setInvitingScanner(false)
    }
  }

  const handleRemoveScanner = async (scannerId: string) => {
    if (!confirm("Hapus scanner ini dari event? Mereka tidak bisa lagi memvalidasi tiket event ini.")) return
    try {
      await fetch(`/api/scanner/event/${selectedEventId}/${scannerId}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      setScanners((prev) => prev.filter((s) => s.scannerId !== scannerId))
    } catch {}
  }

  const handleRemoveCrew = async (crewUserId: string) => {
    if (!confirm("Hapus crew ini dari event? Semua data kas mereka akan ikut terhapus.")) return
    try {
      await fetch(`/api/crew/${crewUserId}?eventId=${selectedEventId}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      setCrew((prev) => prev.filter((c) => c.crewId !== crewUserId))
    } catch {}
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
            <Users className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Field Crew
              </h1>
              <span className="rounded-full bg-emerald-800 px-2 py-0.5 text-[10px] font-bold text-white">
                PRO
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              Kelola crew lapangan dan petugas scanner tiket per event.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-emerald-50">
            <Lock className="size-7 text-emerald-800" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">🔒 Fitur Pro</p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
              Field Crew Management tersedia untuk pengguna Pro. Upgrade untuk mengelola crew lapangan.
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
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
          <Users className="size-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Field Crew
            </h1>
            <span className="rounded-full bg-emerald-800 px-2 py-0.5 text-[10px] font-bold text-white">
              PRO
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            Kelola crew lapangan dan petugas scanner tiket per event.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Saldo kas &amp; top-up per crew ada di halaman{" "}
            <Link href="/dashboard/petty-cash" className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900">
              Petty Cash
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Event selector */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Pilih Event</label>
        <select
          value={selectedEventId}
          onChange={(e) => {
            setSelectedEventId(e.target.value)
            setCrew([])
          }}
          className="max-w-sm truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
        >
          <option value="">-- Pilih event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </select>
      </div>

      {/* No event */}
      {!selectedEventId && (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center">
          <Users className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm text-slate-400">Pilih event untuk mengelola field crew.</p>
        </div>
      )}

      {/* Terkunci Pro untuk event terpilih (backend 402) — selector tetap tampil supaya
          user bisa pindah ke event lain yang Pro-nya aktif. */}
      {selectedEventId && proLocked && (
        <ProLockPanel
          eventId={selectedEventId}
          featureName="Field Crew & Scanner Tiket"
          description="Event ini belum aktif Pro. Kelola crew lapangan dan petugas scanner khusus Pro — upgrade untuk membuka fitur ini untuk event terpilih."
        />
      )}

      {selectedEventId && !proLocked && (
          <div className="grid gap-6 lg:grid-cols-5">
            {/* Left: Invite form */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="mb-1 text-sm font-semibold text-slate-900">Tambah Crew ke Event</p>
                <p className="mb-4 text-xs text-slate-400">
                  Crew harus sudah daftar di nexeventapp.tech terlebih dahulu dengan role "crew".
                </p>
                <form onSubmit={handleInvite} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Email Crew</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="crew@email.com"
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Divisi</label>
                    <input
                      type="text"
                      value={inviteDivision}
                      onChange={(e) => setInviteDivision(e.target.value)}
                      placeholder="Produksi / Operasional / Logistik…"
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                    />
                  </div>
                  {inviteError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{inviteError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={inviting}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                  >
                    <Plus className="size-4" />
                    {inviting ? "Menambahkan..." : "Invite ke Event"}
                  </button>
                </form>

                {/* Petty Cash shortcut */}
                <Link
                  href="/dashboard/petty-cash"
                  className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                >
                  <Wallet className="size-4" />
                  Kelola Petty Cash
                </Link>
              </div>
            </div>

            {/* Right: Crew list */}
            <div className="lg:col-span-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="mb-4 text-sm font-semibold text-slate-900">
                  Daftar Crew ({crew.length})
                </p>

                {fetchingCrew ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
                  </div>
                ) : crew.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    Belum ada crew di event ini.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {crew.map((c) => (
                      <li key={c.accountId} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              {c.division}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-400">{c.email}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveCrew(c.crewId)}
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
      )}

      {/* ── Undang Scanner Tiket (validasi QR di venue) ── */}
      {selectedEventId && (
        <>
          <div className="flex items-start gap-4 border-t border-slate-200 pt-6">
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
              <ScanLine className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">Scanner Tiket</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Undang petugas untuk memvalidasi QR tiket di pintu masuk venue.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Petugas harus sudah daftar di nexeventapp.tech dengan role &quot;scanner&quot;, lalu login di nexeventapp.tech/scanner.
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* Left: invite form */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="mb-1 text-sm font-semibold text-slate-900">Undang Scanner ke Event</p>
                <p className="mb-4 text-xs text-slate-400">
                  Masukkan email akun scanner yang sudah terdaftar.
                </p>
                <form onSubmit={handleInviteScanner} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Email Scanner</label>
                    <input
                      type="email"
                      value={scannerEmail}
                      onChange={(e) => setScannerEmail(e.target.value)}
                      placeholder="scanner@email.com"
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                    />
                  </div>
                  {scannerError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{scannerError}</p>
                  )}
                  {scannerSuccess && (
                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{scannerSuccess}</p>
                  )}
                  <button
                    type="submit"
                    disabled={invitingScanner}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                  >
                    <Plus className="size-4" />
                    {invitingScanner ? "Mengundang..." : "Undang Scanner"}
                  </button>
                </form>
              </div>
            </div>

            {/* Right: scanner list */}
            <div className="lg:col-span-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="mb-4 text-sm font-semibold text-slate-900">
                  Scanner Terdaftar ({scanners.length})
                </p>
                {fetchingScanners ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
                  </div>
                ) : scanners.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    Belum ada scanner di event ini.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {scanners.map((s) => (
                      <li key={s.scannerId} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <ScanLine className="size-4 shrink-0 text-emerald-700" />
                            <p className="truncate text-sm font-semibold text-slate-900">{s.name}</p>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-400">{s.email}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveScanner(s.scannerId)}
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
