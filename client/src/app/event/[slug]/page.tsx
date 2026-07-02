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
  ticketTypes: TicketType[]
}

type StorefrontStatus = "loading" | "not_found" | "not_started" | "ended" | "active" | "error"

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

const MAX_QTY_PER_TYPE = 4

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
  const totalAmount = selectedItems.reduce((sum, item) => {
    const tt = event?.ticketTypes.find((t) => t.id === item.ticketTypeId)
    return sum + (tt ? tt.price * item.quantity : 0)
  }, 0)

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
    <div className="mx-auto flex min-h-screen w-full max-w-[680px] flex-col bg-white px-4 py-8 sm:px-6">
      <Script
        src="https://app.sandbox.midtrans.com/snap/snap.js"
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
        strategy="afterInteractive"
      />

      {status === "loading" && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-emerald-800" />
        </div>
      )}

      {status === "not_found" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <AlertCircle className="size-10 text-slate-300" />
          <p className="text-lg font-semibold text-slate-900">Event tidak ditemukan</p>
          <p className="text-sm text-slate-500">Pastikan link yang Anda buka sudah benar.</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <AlertCircle className="size-10 text-red-300" />
          <p className="text-lg font-semibold text-slate-900">Gagal memuat halaman</p>
          <p className="text-sm text-slate-500">Silakan coba lagi beberapa saat lagi.</p>
        </div>
      )}

      {event && (status === "not_started" || status === "ended" || status === "active") && (
        <>
          {/* Event header */}
          <div className="border-b border-slate-100 pb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{event.title}</h1>
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
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <TicketIcon className="size-4 text-emerald-700" /> Pilih Tiket
                    </p>
                    {event.ticketTypes.map((tt) => {
                      const qty = quantities[tt.id] || 0
                      return (
                        <div
                          key={tt.id}
                          className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${tt.isSoldOut ? "border-slate-100 bg-slate-50 opacity-60" : "border-slate-200"}`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate font-semibold text-slate-900">{tt.name}</p>
                              {tt.isSoldOut && (
                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">Habis</span>
                              )}
                            </div>
                            {tt.description && <p className="mt-0.5 truncate text-xs text-slate-500">{tt.description}</p>}
                            <p className="mt-1 text-sm font-semibold text-emerald-800">{IDR.format(tt.price)}</p>
                            {!tt.isSoldOut && <p className="text-xs text-slate-400">Sisa: {tt.available} tiket</p>}
                          </div>
                          {!tt.isSoldOut && (
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setQty(tt.id, -1, tt.available)}
                                disabled={qty === 0}
                                className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40"
                              >
                                <Minus className="size-3.5" />
                              </button>
                              <span className="w-5 text-center text-sm font-semibold text-slate-900">{qty}</span>
                              <button
                                type="button"
                                onClick={() => setQty(tt.id, 1, tt.available)}
                                disabled={qty >= Math.min(MAX_QTY_PER_TYPE, tt.available)}
                                className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40"
                              >
                                <Plus className="size-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {totalQty > 0 && (
                    <>
                      {/* Buyer form */}
                      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
                        <p className="text-sm font-semibold text-slate-900">Data Pembeli</p>
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
                          <p className="mt-1 text-[11px] text-slate-400">Maksimal 4 tiket per NIK per event.</p>
                        </div>
                      </div>

                      {/* Order summary */}
                      <div className="mt-4 rounded-xl bg-slate-50 p-4">
                        <p className="mb-2 text-sm font-semibold text-slate-900">Ringkasan Pesanan</p>
                        <div className="flex flex-col gap-1.5">
                          {selectedItems.map((item) => {
                            const tt = event.ticketTypes.find((t) => t.id === item.ticketTypeId)!
                            return (
                              <div key={item.ticketTypeId} className="flex items-center justify-between text-sm text-slate-600">
                                <span>{tt.name} × {item.quantity}</span>
                                <span>{IDR.format(tt.price * item.quantity)}</span>
                              </div>
                            )
                          })}
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                          <span className="text-sm font-semibold text-slate-900">Total</span>
                          <span className="text-lg font-bold text-emerald-800">{IDR.format(totalAmount)}</span>
                        </div>
                      </div>

                      {formError && (
                        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>
                      )}

                      <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                      >
                        {submitting ? "Memproses..." : `Beli Tiket Sekarang — ${IDR.format(totalAmount)}`}
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )}

          <p className="mt-10 pb-2 text-center text-xs text-slate-400">Powered by nexEvent</p>
        </>
      )}
    </div>
  )
}
