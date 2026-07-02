"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Script from "next/script"
import { Minus, Plus, MapPin, CalendarDays, Ticket as TicketIcon, Loader2, AlertCircle } from "lucide-react"

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

type TicketType = {
  id: string
  name: string
  description: string | null
  price: number
  quota: number
  sold: number
  available: number
  isSoldOut: boolean
}

type EventData = {
  id: string
  title: string
  location: string
  event_date: string
  saleStartAt: string | null
  saleEndAt: string | null
  bannerUrl: string | null
  logoUrl: string | null
  feePercent: number
  feeBearer: "audience" | "promotor" | null
  taxEnabled: boolean
  ticketTypes: TicketType[]
}

type StorefrontStatus = "loading" | "not_found" | "not_started" | "ended" | "active" | "error"

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

const MAX_QTY_PER_TYPE = 4

function initials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")
}

export default function EventStorefrontPage() {
  const { slug } = useParams<{ slug: string }>()

  const [status, setStatus] = useState<StorefrontStatus>("loading")
  const [event, setEvent] = useState<EventData | null>(null)
  const [message, setMessage] = useState("")

  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [buyerName, setBuyerName] = useState("")
  const [buyerEmail, setBuyerEmail] = useState("")
  const [buyerPhone, setBuyerPhone] = useState("")
  const [buyerNik, setBuyerNik] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  useEffect(() => {
    if (!slug) return
    fetch(`/api/storefront/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) {
          setStatus("not_found")
          return
        }
        setEvent(data.event)
        setStatus(data.status as StorefrontStatus)
        setMessage(data.message || "")
      })
      .catch(() => setStatus("error"))
  }, [slug])

  const selectedItems = useMemo(
    () => Object.entries(quantities).filter(([, qty]) => qty > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })),
    [quantities]
  )
  const totalQty = selectedItems.reduce((s, i) => s + i.quantity, 0)
  const subtotal = selectedItems.reduce((sum, item) => {
    const tt = event?.ticketTypes.find((t) => t.id === item.ticketTypeId)
    return sum + (tt ? tt.price * item.quantity : 0)
  }, 0)

  const feeBearer = event?.feeBearer === "audience" ? "audience" : "promotor"
  const taxAmount = event?.taxEnabled ? Math.round(subtotal * 0.1) : 0
  const feeAmount = event ? Math.round(subtotal * (event.feePercent / 100)) : 0
  const totalAmount = feeBearer === "audience" ? subtotal + taxAmount + feeAmount : subtotal + taxAmount

  const setQty = (ticketTypeId: string, delta: number, maxAvailable: number) => {
    setQuantities((prev) => {
      const current = prev[ticketTypeId] || 0
      const next = Math.max(0, Math.min(current + delta, Math.min(MAX_QTY_PER_TYPE, maxAvailable)))
      return { ...prev, [ticketTypeId]: next }
    })
  }

  const handleSubmit = async () => {
    setFormError("")
    if (totalQty === 0) return
    if (!buyerName.trim()) return setFormError("Nama lengkap wajib diisi.")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) return setFormError("Email tidak valid.")
    if (!/^(\+62|62|0)8[0-9]{7,12}$/.test(buyerPhone.replace(/[\s-]/g, ""))) return setFormError("Nomor HP tidak valid (format 08xx atau +62).")
    if (!/^\d{16}$/.test(buyerNik)) return setFormError("NIK harus 16 digit angka.")

    setSubmitting(true)
    try {
      const res = await fetch(`/api/storefront/${slug}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerName, buyerEmail, buyerPhone, buyerNik, items: selectedItems }),
      })
      const data = await res.json()
      if (!data.success) {
        setFormError(data.message || "Gagal membuat pesanan.")
        setSubmitting(false)
        return
      }
      if (!window.snap) {
        setFormError("Sistem pembayaran belum siap dimuat. Coba muat ulang halaman.")
        setSubmitting(false)
        return
      }
      window.snap.pay(data.token, {
        onSuccess: () => { window.location.href = `/order/${data.orderId}?status=success` },
        onPending: () => { window.location.href = `/order/${data.orderId}?status=pending` },
        onError: () => { window.location.href = `/order/${data.orderId}?status=error` },
        onClose: () => setSubmitting(false),
      })
    } catch {
      setFormError("Gagal menghubungi server.")
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-white">
      <Script
        src="https://app.sandbox.midtrans.com/snap/snap.js"
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
        strategy="afterInteractive"
      />

      {status === "loading" && (
        <div className="flex flex-1 items-center justify-center py-24">
          <Loader2 className="size-8 animate-spin text-emerald-800" />
        </div>
      )}

      {status === "not_found" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-24 text-center">
          <AlertCircle className="size-10 text-slate-300" />
          <p className="text-lg font-semibold text-slate-900">Event tidak ditemukan</p>
          <p className="text-sm text-slate-500">Pastikan link yang Anda buka sudah benar.</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-24 text-center">
          <AlertCircle className="size-10 text-red-300" />
          <p className="text-lg font-semibold text-slate-900">Gagal memuat halaman</p>
          <p className="text-sm text-slate-500">Silakan coba lagi beberapa saat lagi.</p>
        </div>
      )}

      {event && (status === "not_started" || status === "ended" || status === "active") && (
        <>
          {/* Banner */}
          <div className="relative h-48 w-full shrink-0 overflow-hidden">
            {event.bannerUrl ? (
              <img src={event.bannerUrl} alt={event.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-r from-emerald-800 to-emerald-600 px-6">
                <p className="text-center text-xl font-bold text-white">{event.title}</p>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
          </div>

          {/* Event header */}
          <div className="px-4 pb-6 pt-3 sm:px-6">
            <div className="-mt-10 flex items-end gap-3">
              {event.logoUrl ? (
                <img
                  src={event.logoUrl}
                  alt="Logo"
                  className="size-14 shrink-0 rounded-full border-4 border-white object-cover shadow-sm"
                />
              ) : (
                <div className="flex size-14 shrink-0 items-center justify-center rounded-full border-4 border-white bg-emerald-100 text-sm font-bold text-emerald-800 shadow-sm">
                  {initials(event.title)}
                </div>
              )}
            </div>

            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{event.title}</h1>
            <div className="mt-3 flex flex-col gap-1.5 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 shrink-0 text-emerald-700" />
                {new Date(event.event_date).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-emerald-700" />
                {event.location}
              </div>
            </div>

            {status === "not_started" && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-800">
                {message || "Penjualan tiket belum dimulai."}
                {event.saleStartAt && (
                  <p className="mt-1 font-semibold">
                    Mulai {new Date(event.saleStartAt).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}
                  </p>
                )}
              </div>
            )}

            {status === "ended" && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
                {message || "Penjualan tiket telah berakhir."}
              </div>
            )}

            {status === "active" && (
              <>
                {event.ticketTypes.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                    Belum ada jenis tiket tersedia.
                  </div>
                ) : event.ticketTypes.every((t) => t.isSoldOut) ? (
                  <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
                    Semua tiket telah habis terjual.
                  </div>
                ) : (
                  <>
                    {/* Ticket selection */}
                    <div className="mt-6 flex flex-col gap-3">
                      <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <TicketIcon className="size-4 text-emerald-700" /> PILIH TIKET
                      </p>
                      {event.ticketTypes.map((tt) => {
                        const qty = quantities[tt.id] || 0
                        if (tt.isSoldOut) {
                          return (
                            <div key={tt.id} className="pointer-events-none opacity-50">
                              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 border-l-4 border-l-slate-300 bg-white p-4 shadow-sm">
                                <div>
                                  <p className="font-bold text-slate-900">{tt.name}</p>
                                  <p className="text-sm text-slate-400">{IDR.format(tt.price)}</p>
                                </div>
                                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">Habis</span>
                              </div>
                            </div>
                          )
                        }
                        return (
                          <div
                            key={tt.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 border-l-4 border-l-emerald-600 bg-white p-4 shadow-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-bold text-slate-900">{tt.name}</p>
                              {tt.description && <p className="mt-0.5 truncate text-xs text-slate-500">{tt.description}</p>}
                              <p className="mt-1 text-sm font-semibold text-emerald-800">{IDR.format(tt.price)}</p>
                              <p className="text-xs text-slate-400">Sisa: {tt.available} tiket</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
                              <button
                                type="button"
                                onClick={() => setQty(tt.id, -1, tt.available)}
                                disabled={qty === 0}
                                className="flex size-7 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-40"
                              >
                                <Minus className="size-3.5" />
                              </button>
                              <span className="w-5 text-center text-sm font-bold text-slate-900">{qty}</span>
                              <button
                                type="button"
                                onClick={() => setQty(tt.id, 1, tt.available)}
                                disabled={qty >= Math.min(MAX_QTY_PER_TYPE, tt.available)}
                                className="flex size-7 items-center justify-center rounded-full bg-emerald-800 text-white shadow-sm transition-colors hover:bg-emerald-900 disabled:opacity-40"
                              >
                                <Plus className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {totalQty > 0 && (
                      <>
                        {/* Order summary */}
                        <div className="mt-6 rounded-xl bg-emerald-800 p-4 text-white">
                          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-emerald-100">Ringkasan Pesanan</p>
                          <div className="flex flex-col gap-1.5">
                            {selectedItems.map((item) => {
                              const tt = event.ticketTypes.find((t) => t.id === item.ticketTypeId)!
                              return (
                                <div key={item.ticketTypeId} className="flex items-center justify-between text-sm text-emerald-50">
                                  <span>{item.quantity}× {tt.name}</span>
                                  <span>{IDR.format(tt.price * item.quantity)}</span>
                                </div>
                              )
                            })}
                            {feeBearer === "audience" && feeAmount > 0 && (
                              <div className="flex items-center justify-between text-sm text-emerald-50">
                                <span>Biaya layanan ({event.feePercent}%)</span>
                                <span>{IDR.format(feeAmount)}</span>
                              </div>
                            )}
                            {taxAmount > 0 && (
                              <div className="flex items-center justify-between text-sm text-emerald-50">
                                <span>Pajak (10%)</span>
                                <span>{IDR.format(taxAmount)}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-3 flex items-center justify-between border-t border-emerald-700 pt-3">
                            <span className="text-sm font-semibold">Total</span>
                            <span className="text-lg font-bold">{IDR.format(totalAmount)}</span>
                          </div>
                        </div>

                        {/* Buyer form */}
                        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
                          <p className="text-sm font-bold text-slate-900">DATA PEMBELI</p>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-500">Nama Lengkap</label>
                            <input
                              value={buyerName}
                              onChange={(e) => setBuyerName(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
                            <input
                              type="email"
                              value={buyerEmail}
                              onChange={(e) => setBuyerEmail(e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-500">Nomor HP</label>
                            <input
                              value={buyerPhone}
                              onChange={(e) => setBuyerPhone(e.target.value)}
                              placeholder="08xx atau +62"
                              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-500">NIK KTP</label>
                            <input
                              value={buyerNik}
                              onChange={(e) => setBuyerNik(e.target.value.replace(/\D/g, "").slice(0, 16))}
                              inputMode="numeric"
                              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                            />
                            <p className="mt-1 text-[11px] text-slate-400">ℹ️ Maksimal 4 tiket per NIK per event.</p>
                          </div>
                        </div>

                        {formError && (
                          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>
                        )}

                        <button
                          onClick={handleSubmit}
                          disabled={submitting}
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-900 disabled:opacity-50"
                        >
                          {submitting ? "Memproses..." : `Beli Tiket — ${IDR.format(totalAmount)} →`}
                        </button>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            <p className="mt-10 pb-2 text-center text-xs text-slate-400">Powered by nexEvent</p>
          </div>
        </>
      )}
    </div>
  )
}
