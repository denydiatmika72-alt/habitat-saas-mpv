"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Script from "next/script"
import { CheckCircle2, XCircle, Clock, Crown, Sparkles } from "lucide-react"
import { useUser } from "@/hooks/useUser"

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        options: {
          onSuccess?: (result: unknown) => void
          onPending?: (result: unknown) => void
          onError?: (result: unknown) => void
          onClose?: () => void
        }
      ) => void
    }
  }
}

type Event = { id: string; title: string }

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

const getToken = () =>
  typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
})

const FEATURES = [
  "Semua fitur Pro",
  "Sponsor Magic Link",
  "Expense Tracker",
  "Field Crew + Petty Cash",
  "Laporan P&L otomatis",
  "Export PDF",
  "Data tersimpan selamanya",
]

function StatusBanner({ status }: { status: string }) {
  const map = {
    success: {
      icon: CheckCircle2,
      title: "Pembayaran Berhasil!",
      desc: "Lisensi Pro kamu sudah aktif. Selamat menikmati semua fitur nexEvent Pro.",
      wrap: "border-emerald-200 bg-emerald-50",
      icon_: "text-emerald-600",
      title_: "text-emerald-800",
      desc_: "text-emerald-700",
    },
    error: {
      icon: XCircle,
      title: "Pembayaran Gagal",
      desc: "Terjadi kendala saat memproses pembayaran. Silakan coba lagi.",
      wrap: "border-red-200 bg-red-50",
      icon_: "text-red-600",
      title_: "text-red-800",
      desc_: "text-red-700",
    },
    pending: {
      icon: Clock,
      title: "Pembayaran Menunggu Konfirmasi",
      desc: "Selesaikan pembayaran sesuai instruksi. Status akan diperbarui otomatis setelah pembayaran dikonfirmasi.",
      wrap: "border-amber-200 bg-amber-50",
      icon_: "text-amber-600",
      title_: "text-amber-800",
      desc_: "text-amber-700",
    },
  } as const

  const info = map[status as keyof typeof map]
  if (!info) return null
  const Icon = info.icon

  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${info.wrap}`}>
      <Icon className={`mt-0.5 size-5 shrink-0 ${info.icon_}`} />
      <div>
        <p className={`text-sm font-semibold ${info.title_}`}>{info.title}</p>
        <p className={`mt-0.5 text-sm ${info.desc_}`}>{info.desc}</p>
      </div>
    </div>
  )
}

function UpgradePageInner() {
  const searchParams = useSearchParams()
  const status = searchParams.get("status")
  const { user, isPro, isProExpiringSoon, daysUntilExpiry, loading: userLoading } = useUser()

  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState("")
  const [paying, setPaying] = useState<"activation" | "extension" | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/events", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success) setEvents(data.data)
      })
      .catch(() => {})
  }, [])

  const activeEvent = events.find((e) => e.id === user?.proEventId)

  const pay = async (type: "activation" | "extension") => {
    const eventId = type === "activation" ? selectedEventId : user?.proEventId
    if (!eventId) {
      setError("Pilih event terlebih dahulu.")
      return
    }
    setError("")
    setPaying(type)
    try {
      const res = await fetch("/api/payments/create-pro", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ eventId, type }),
      })
      const data = await res.json()
      if (!data.success || !data.token) {
        setError(data.message || "Gagal membuat transaksi pembayaran.")
        setPaying(null)
        return
      }
      if (!window.snap) {
        setError("Midtrans belum siap dimuat. Coba muat ulang halaman.")
        setPaying(null)
        return
      }
      window.snap.pay(data.token, {
        onSuccess: () => {
          window.location.href = "/dashboard/upgrade?status=success"
        },
        onPending: () => {
          window.location.href = "/dashboard/upgrade?status=pending"
        },
        onError: () => {
          window.location.href = "/dashboard/upgrade?status=error"
        },
        onClose: () => setPaying(null),
      })
    } catch {
      setError("Gagal terhubung ke server pembayaran.")
      setPaying(null)
    }
  }

  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Script
        src="https://app.sandbox.midtrans.com/snap/snap.js"
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
        strategy="afterInteractive"
      />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Upgrade ke Pro
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Kelola event musikmu dengan lebih profesional.
        </p>
      </div>

      {status && <StatusBanner status={status} />}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {isPro ? (
        <>
          {/* Current plan info */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                <Crown className="size-4" />
              </div>
              <p className="text-sm font-semibold text-slate-900">Paket Pro Aktif</p>
              {isProExpiringSoon && (
                <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  Berakhir {daysUntilExpiry} hari lagi
                </span>
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Event</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {activeEvent?.title ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Expired</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {user?.proExpiresAt
                    ? new Date(user.proExpiresAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "-"}
                </p>
              </div>
            </div>
          </div>

          {/* Extension card */}
          <div className="rounded-xl border border-emerald-800/30 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">
              Perpanjangan
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {IDR.format(99000)}{" "}
              <span className="text-sm font-medium text-slate-500">/ +30 hari</span>
            </p>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              <p>
                Event: <span className="font-medium text-slate-900">{activeEvent?.title ?? "-"}</span>
              </p>
              <p className="mt-1">
                Expired:{" "}
                <span className="font-medium text-slate-900">
                  {user?.proExpiresAt
                    ? new Date(user.proExpiresAt).toLocaleDateString("id-ID")
                    : "-"}
                </span>{" "}
                {daysUntilExpiry !== null && `(${daysUntilExpiry} hari lagi)`}
              </p>
            </div>
            <button
              onClick={() => pay("extension")}
              disabled={paying !== null}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
            >
              {paying === "extension" ? "Memproses..." : "Perpanjang Sekarang →"}
            </button>
          </div>
        </>
      ) : (
        /* Activation card */
        <div className="rounded-xl border-2 border-emerald-800 bg-white p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-emerald-800" />
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">
              Pro Per-Event
            </p>
          </div>
          <p className="mt-1 text-3xl font-bold text-slate-900">{IDR.format(499000)}</p>
          <p className="mt-1 text-sm text-slate-500">Aktif 90 hari dari tanggal pembayaran</p>

          <ul className="mt-5 space-y-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-700" />
                {f}
              </li>
            ))}
          </ul>

          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Pilih Event</label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
            >
              <option value="">-- Pilih event --</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => pay("activation")}
            disabled={paying !== null}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
          >
            {paying === "activation" ? "Memproses..." : "Bayar Sekarang →"}
          </button>
        </div>
      )}
    </div>
  )
}

export default function UpgradePageWrapper() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">Memuat...</div>}>
      <UpgradePageInner />
    </Suspense>
  )
}
