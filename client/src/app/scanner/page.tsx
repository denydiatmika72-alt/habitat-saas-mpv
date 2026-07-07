"use client"

import { useEffect, useRef, useState } from "react"
import { ScanLine, LogIn, CheckCircle2, XCircle, ArrowLeft } from "lucide-react"
import Link from "next/link"

type EventItem = {
  eventId: string
  eventTitle: string
  eventDate: string
  location: string
}

// Hasil scan untuk overlay full-screen.
type ScanResult = { ok: boolean; title: string; lines: string[] }

type View = "loading" | "login" | "wrong-role" | "pick-event" | "no-events" | "scanning"

const getToken = () => (typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "")
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" })

const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-"

export default function ScannerPage() {
  const [view, setView] = useState<View>("loading")
  const [userName, setUserName] = useState("")
  const [userRole, setUserRole] = useState("")
  const [events, setEvents] = useState<EventItem[]>([])
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null)

  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [loggingIn, setLoggingIn] = useState(false)

  const [result, setResult] = useState<ScanResult | null>(null)
  const [cameraError, setCameraError] = useState("")

  // Refs untuk instance kamera + guard supaya 1 QR tidak divalidasi berkali-kali.
  const html5Ref = useRef<{ start: Function; stop: () => Promise<void>; clear: () => void; pause: (b?: boolean) => void; resume: () => void } | null>(null)
  const processingRef = useRef(false)
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── AUTH ──
  const checkAuth = async () => {
    const token = getToken()
    if (!token) { setView("login"); return }
    try {
      const res = await fetch("/api/auth/me", { headers: authHeaders() })
      if (!res.ok) { setView("login"); return }
      const data = await res.json()
      setUserName(data.data.name)
      setUserRole(data.data.role)
      if (data.data.role !== "scanner") { setView("wrong-role"); return }
      loadEvents()
    } catch { setView("login") }
  }

  const loadEvents = async () => {
    try {
      const res = await fetch("/api/scanner/my-events", { headers: authHeaders() })
      const data = await res.json()
      if (data.success && data.events.length > 0) {
        setEvents(data.events)
        if (data.events.length === 1) { setSelectedEvent(data.events[0]); setView("scanning") }
        else { setView("pick-event") }
      } else {
        setView("no-events")
      }
    } catch { setView("no-events") }
  }

  useEffect(() => { checkAuth() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError("")
    setLoggingIn(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem("token", data.token)
        if (data.data.role) localStorage.setItem("user_role", data.data.role)
        setUserName(data.data.name)
        setUserRole(data.data.role)
        if (data.data.role !== "scanner") { setView("wrong-role"); return }
        loadEvents()
      } else {
        setLoginError(data.message ?? "Login gagal.")
      }
    } catch { setLoginError("Gagal menghubungi server.") }
    finally { setLoggingIn(false) }
  }

  // ── KAMERA ──
  const startScanner = async () => {
    setCameraError("")
    if (html5Ref.current) return
    try {
      const { Html5Qrcode } = await import("html5-qrcode")
      const instance = new Html5Qrcode("qr-reader")
      // Simpan sebelum start supaya cleanup bisa stop kalau start keburu di-unmount.
      html5Ref.current = instance as unknown as typeof html5Ref.current
      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => { handleDecode(decodedText) },
        () => {} // per-frame decode miss — abaikan (bukan error nyata)
      )
    } catch {
      html5Ref.current = null
      setCameraError("Tidak bisa mengakses kamera. Pastikan izin kamera diberikan di browser, lalu coba lagi.")
    }
  }

  const stopScanner = async () => {
    const inst = html5Ref.current
    html5Ref.current = null
    processingRef.current = false
    if (resultTimerRef.current) { clearTimeout(resultTimerRef.current); resultTimerRef.current = null }
    if (inst) {
      try { await inst.stop() } catch {}
      try { inst.clear() } catch {}
    }
  }

  // Start/stop kamera saat masuk/keluar view "scanning".
  useEffect(() => {
    if (view !== "scanning" || !selectedEvent) return
    startScanner()
    return () => { stopScanner() }
  }, [view, selectedEvent?.eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  const dismissResult = () => {
    if (resultTimerRef.current) { clearTimeout(resultTimerRef.current); resultTimerRef.current = null }
    setResult(null)
    try { html5Ref.current?.resume() } catch {}
    processingRef.current = false
  }

  const handleDecode = async (code: string) => {
    if (processingRef.current || !selectedEvent) return
    processingRef.current = true
    try { html5Ref.current?.pause(true) } catch {}

    try {
      const res = await fetch("/api/scanner/validate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ eventId: selectedEvent.eventId, ticketCode: code }),
      })
      const data = await res.json()
      if (data.success) {
        setResult({ ok: true, title: "TIKET VALID", lines: [data.buyerName || "-", data.typeName || "Tiket"] })
      } else if (data.status === "used") {
        setResult({ ok: false, title: "SUDAH DIPAKAI", lines: [`Dipakai: ${fmtDateTime(data.usedAt)}`, data.typeName ? String(data.typeName) : ""] })
      } else {
        setResult({ ok: false, title: "DITOLAK", lines: [data.message || "Tiket tidak valid."] })
      }
    } catch {
      setResult({ ok: false, title: "GAGAL", lines: ["Gagal menghubungi server. Coba scan lagi."] })
    }

    // Auto-kembali ke mode scan setelah 3 detik (atau tap layar untuk lanjut lebih cepat).
    resultTimerRef.current = setTimeout(dismissResult, 3000)
  }

  // ── VIEWS ──
  if (view === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
      </div>
    )
  }

  if (view === "login") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-800 text-white">
              <ScanLine className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Ticket Scanner</p>
              <p className="text-xs text-slate-500">nexEvent</p>
            </div>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="email@kamu.com"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            {loginError && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{loginError}</p>
            )}
            <button
              type="submit"
              disabled={loggingIn}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 text-sm font-bold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
            >
              <LogIn className="size-4" />
              {loggingIn ? "Masuk..." : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (view === "wrong-role") {
    const dest = userRole === "crew" ? "/field" : "/dashboard"
    const destLabel = userRole === "crew" ? "Ke Halaman Field Crew →" : "Ke Dashboard Promotor →"
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm text-center">
          <p className="mb-2 text-lg font-semibold text-slate-900">Hei, {userName}!</p>
          <p className="mb-6 text-sm text-slate-500">
            Halaman ini khusus untuk petugas Scanner tiket. Akun kamu terdaftar sebagai {userRole || "pengguna lain"}.
          </p>
          <Link
            href={dest}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-900"
          >
            {destLabel}
          </Link>
        </div>
      </div>
    )
  }

  if (view === "no-events") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-slate-100">
            <ScanLine className="size-6 text-slate-400" />
          </div>
          <p className="mb-2 text-lg font-semibold text-slate-900">Hei, {userName}!</p>
          <p className="text-sm text-slate-500">
            Kamu belum ditugaskan ke event manapun. Hubungi promotor untuk ditambahkan sebagai scanner.
          </p>
        </div>
      </div>
    )
  }

  if (view === "pick-event") {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-800 text-white">
              <ScanLine className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Hei, {userName}!</p>
              <p className="text-xs text-slate-500">Pilih event yang mau kamu jaga</p>
            </div>
          </div>
          <ul className="space-y-3">
            {events.map((ev) => (
              <li key={ev.eventId}>
                <button
                  onClick={() => { setSelectedEvent(ev); setView("scanning") }}
                  className="w-full rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50 active:scale-[0.98]"
                >
                  <p className="font-semibold text-slate-900">{ev.eventTitle}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(ev.eventDate).toLocaleDateString("id-ID", { dateStyle: "medium" })} · {ev.location}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  // ── SCANNING ──
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{selectedEvent?.eventTitle}</p>
            <p className="text-xs text-slate-500">Scan QR tiket di pintu masuk</p>
          </div>
          {events.length > 1 && (
            <button
              onClick={async () => { await stopScanner(); setSelectedEvent(null); setView("pick-event") }}
              className="flex min-h-[44px] shrink-0 items-center gap-1 px-2 text-xs font-medium text-emerald-700 hover:underline"
            >
              <ArrowLeft className="size-3.5" /> Ganti event
            </button>
          )}
        </div>

        {/* Kamera */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black">
          <div id="qr-reader" className="w-full" />
        </div>

        {cameraError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <p>{cameraError}</p>
            <button
              onClick={() => startScanner()}
              className="mt-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900"
            >
              Coba Lagi
            </button>
          </div>
        ) : (
          <p className="mt-4 text-center text-xs text-slate-500">
            Arahkan kamera ke QR tiket. Hasil validasi muncul otomatis.
          </p>
        )}
      </div>

      {/* Overlay hasil scan — full screen, hijau (valid) / merah (ditolak). Tap untuk lanjut. */}
      {result && (
        <button
          type="button"
          onClick={dismissResult}
          className={`fixed inset-0 z-50 flex w-full flex-col items-center justify-center px-6 text-center ${
            result.ok ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {result.ok ? (
            <CheckCircle2 className="size-24 text-white" />
          ) : (
            <XCircle className="size-24 text-white" />
          )}
          <p className="mt-4 text-3xl font-black tracking-tight text-white">{result.title}</p>
          <div className="mt-3 space-y-1">
            {result.lines.filter(Boolean).map((line, i) => (
              <p key={i} className={`${i === 0 ? "text-xl font-bold" : "text-base"} text-white/90`}>{line}</p>
            ))}
          </div>
          <p className="mt-8 text-sm text-white/70">Tap untuk scan berikutnya</p>
        </button>
      )}
    </div>
  )
}
