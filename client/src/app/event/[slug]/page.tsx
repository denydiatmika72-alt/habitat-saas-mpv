"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Script from "next/script"
import { Calendar, MapPin, Check, Minus, Plus, Ticket, Shield, Mail, Loader2, AlertCircle } from "lucide-react"

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

type Facility = { id: string; name: string; isCustom?: boolean }

type MerchVariant = {
  id: string
  size: string
  stock: number
  sold: number
  available: number
  isSoldOut: boolean
}

type MerchItem = {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  variants: MerchVariant[]
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
  description: string | null
  facilities: Facility[] | null
  termsConditions: string | null
  ticketTypes: TicketType[]
  merchItems: MerchItem[]
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
  const [merchQuantities, setMerchQuantities] = useState<Record<string, number>>({})
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
  // Kunci merchQuantities: `${itemId}::${variantId}` — pemisah "::" karena UUID mengandung "-".
  const selectedMerch = useMemo(
    () =>
      Object.entries(merchQuantities)
        .filter(([, qty]) => qty > 0)
        .map(([key, quantity]) => {
          const [itemId, variantId] = key.split("::")
          return { key, itemId, variantId, quantity }
        }),
    [merchQuantities]
  )

  const totalTicketQty = selectedItems.reduce((s, i) => s + i.quantity, 0)
  const totalMerchQty = selectedMerch.reduce((s, i) => s + i.quantity, 0)
  const totalQty = totalTicketQty + totalMerchQty // total gabungan (tiket + merch)

  const ticketSubtotal = selectedItems.reduce((sum, item) => {
    const tt = event?.ticketTypes.find((t) => t.id === item.ticketTypeId)
    return sum + (tt ? tt.price * item.quantity : 0)
  }, 0)
  const merchSubtotal = selectedMerch.reduce((sum, item) => {
    const mi = event?.merchItems.find((m) => m.id === item.itemId)
    return sum + (mi ? mi.price * item.quantity : 0)
  }, 0)
  const subtotal = ticketSubtotal + merchSubtotal

  const feeBearer = event?.feeBearer === "audience" ? "audience" : "promotor"
  const taxAmount = event?.taxEnabled ? Math.round(subtotal * 0.1) : 0
  const feeAmount = event ? Math.round(subtotal * (event.feePercent / 100)) : 0
  const totalAmount = feeBearer === "audience" ? subtotal + taxAmount + feeAmount : subtotal + taxAmount

  const updateQty = (ticketTypeId: string, delta: number) => {
    const tt = event?.ticketTypes.find((t) => t.id === ticketTypeId)
    const maxAvailable = tt?.available ?? 0
    setQuantities((prev) => {
      const current = prev[ticketTypeId] || 0
      const next = Math.max(0, Math.min(current + delta, Math.min(MAX_QTY_PER_TYPE, maxAvailable)))
      return { ...prev, [ticketTypeId]: next }
    })
  }

  const updateMerchQty = (itemId: string, variantId: string, delta: number) => {
    const key = `${itemId}::${variantId}`
    const item = event?.merchItems.find((m) => m.id === itemId)
    const variant = item?.variants.find((v) => v.id === variantId)
    const maxAvailable = variant?.available ?? 0
    setMerchQuantities((prev) => {
      const current = prev[key] || 0
      const next = Math.max(0, Math.min(current + delta, maxAvailable))
      return { ...prev, [key]: next }
    })
  }

  const handleBuy = async () => {
    setFormError("")
    if (totalTicketQty === 0 && totalMerchQty === 0) return
    if (!buyerName.trim()) return setFormError("Nama lengkap wajib diisi.")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) return setFormError("Email tidak valid.")
    if (!/^(\+62|62|0)8[0-9]{7,12}$/.test(buyerPhone.replace(/[\s-]/g, ""))) return setFormError("Nomor HP tidak valid (format 08xx atau +62).")
    // NIK wajib hanya kalau ada pembelian tiket (anti-calo). Merch-only tidak butuh NIK.
    if (totalTicketQty > 0 && !/^\d{16}$/.test(buyerNik)) return setFormError("NIK harus 16 digit angka.")

    setSubmitting(true)
    try {
      const res = await fetch(`/api/storefront/${slug}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName,
          buyerEmail,
          buyerPhone,
          buyerNik,
          ticketItems: selectedItems,
          merchItems: selectedMerch.map((m) => ({ variantId: m.variantId, quantity: m.quantity })),
        }),
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

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="size-8 animate-spin text-emerald-800" />
      </div>
    )
  }

  if (status === "not_found") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center">
        <AlertCircle className="size-10 text-slate-300" />
        <p className="text-lg font-semibold text-slate-900">Event tidak ditemukan</p>
        <p className="text-sm text-slate-500">Pastikan link yang Anda buka sudah benar.</p>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center">
        <AlertCircle className="size-10 text-red-300" />
        <p className="text-lg font-semibold text-slate-900">Gagal memuat halaman</p>
        <p className="text-sm text-slate-500">Silakan coba lagi beberapa saat lagi.</p>
      </div>
    )
  }

  if (!event) return null

  const formattedDate = new Date(event.event_date).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  // Reused in both the single-column (not_started/ended) and 2-column (active) layouts.
  const eventHeader = (
    <div className="border-b border-slate-200 pb-6">
      <h1 className="mb-3 text-2xl font-black text-slate-900">{event.title}</h1>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-slate-600">
          <Calendar className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="text-sm">{formattedDate}</span>
        </div>
        {event.location && (
          <div className="flex items-center gap-2 text-slate-600">
            <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="text-sm">{event.location}</span>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <Script
        src="https://app.sandbox.midtrans.com/snap/snap.js"
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
        strategy="afterInteractive"
      />

      {/* HERO SECTION — full width, above the 2-column grid */}
      <div className="relative">
        <div className="h-56 w-full overflow-hidden sm:h-64">
          {event.bannerUrl ? (
            <img src={event.bannerUrl} alt={event.title} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-600" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        </div>

        {/* Logo overlapping banner */}
        <div className="absolute -bottom-8 left-4 sm:left-6">
          {event.logoUrl ? (
            <img
              src={event.logoUrl}
              alt="Logo"
              className="size-16 rounded-2xl border-4 border-white object-cover shadow-lg"
            />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-2xl border-4 border-white bg-emerald-800 shadow-lg">
              <span className="text-2xl font-black text-white">{initials(event.title)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Non-active states: single column */}
      {status !== "active" ? (
        <div className="mx-auto max-w-lg px-4 pb-8 pt-12">
          {eventHeader}

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
        </div>
      ) : (
        /* Active state: 2 columns on desktop (lg+), single column on mobile */
        <div className="mx-auto max-w-5xl px-4 pb-8 pt-12 lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8">
          {/* LEFT COLUMN — event info + ticket selection */}
          <div>
            {eventHeader}

            {/* ABOUT THIS EVENT */}
            {event.description && (
              <div className="border-b border-slate-200 py-6">
                <h2 className="mb-3 text-base font-bold text-slate-900">Tentang Event Ini</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{event.description}</p>
              </div>
            )}

            {/* FACILITIES */}
            {event.facilities && event.facilities.length > 0 && (
              <div className="border-b border-slate-200 py-6">
                <h2 className="mb-3 text-base font-bold text-slate-900">Fasilitas</h2>
                <div className="grid grid-cols-2 gap-2">
                  {event.facilities.map((facility) => (
                    <div key={facility.id} className="flex items-center gap-2 text-sm text-slate-600">
                      <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                        <Check className="h-3 w-3 text-emerald-600" />
                      </div>
                      {facility.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TICKET SELECTION */}
            {event.ticketTypes.length === 0 ? (
              <div className="my-6 rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
                Belum ada jenis tiket tersedia.
              </div>
            ) : event.ticketTypes.every((t) => t.isSoldOut) ? (
              <div className="my-6 rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
                Semua tiket telah habis terjual.
              </div>
            ) : (
              <div className="border-b border-slate-200 py-6">
                <h2 className="mb-4 text-base font-bold text-slate-900">Pilih Tiket</h2>
                <div className="space-y-3">
                  {event.ticketTypes.map((ticket) => {
                    const isSoldOut = ticket.isSoldOut
                    const qty = quantities[ticket.id] || 0

                    return (
                      <div
                        key={ticket.id}
                        className={`rounded-2xl border p-4 transition-all ${
                          isSoldOut
                            ? "border-slate-200 bg-slate-50 opacity-60"
                            : qty > 0
                              ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
                              : "border-slate-200 bg-white hover:border-emerald-300"
                        }`}
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900">{ticket.name}</p>
                            {ticket.description && (
                              <p className="mt-0.5 text-xs text-slate-400">{ticket.description}</p>
                            )}
                          </div>
                          <p className="shrink-0 text-base font-black text-emerald-700">{IDR.format(ticket.price)}</p>
                        </div>

                        {isSoldOut ? (
                          <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">
                            Habis Terjual
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => updateQty(ticket.id, -1)}
                              disabled={qty === 0}
                              className="flex size-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition-colors hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-30"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center font-bold text-slate-900">{qty}</span>
                            <button
                              type="button"
                              onClick={() => updateQty(ticket.id, 1)}
                              disabled={qty >= Math.min(MAX_QTY_PER_TYPE, ticket.available)}
                              className="flex size-8 items-center justify-center rounded-full bg-emerald-800 text-white transition-colors hover:bg-emerald-700 disabled:opacity-30"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* MERCHANDISE */}
            {event.merchItems && event.merchItems.length > 0 && (
              <div className="border-b border-slate-200 py-6">
                <h2 className="mb-4 text-base font-bold text-slate-900">Merchandise</h2>
                <div className="space-y-4">
                  {event.merchItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="mb-3 flex gap-4">
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="size-20 shrink-0 rounded-xl border border-slate-100 object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900">{item.name}</p>
                          {item.description && <p className="mt-0.5 text-xs text-slate-400">{item.description}</p>}
                          <p className="mt-1 font-black text-emerald-700">{IDR.format(item.price)}</p>
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-xs font-bold text-slate-500">Pilih Size &amp; Jumlah</p>
                        <div className="space-y-2">
                          {item.variants.map((variant) => {
                            const key = `${item.id}::${variant.id}`
                            const qty = merchQuantities[key] || 0
                            return (
                              <div
                                key={variant.id}
                                className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                                  variant.isSoldOut
                                    ? "border-slate-100 bg-slate-50 opacity-50"
                                    : qty > 0
                                      ? "border-emerald-400 bg-emerald-50/50"
                                      : "border-slate-200"
                                }`}
                              >
                                <span className={`text-sm font-bold ${variant.isSoldOut ? "text-slate-400" : "text-slate-700"}`}>
                                  {variant.size}
                                  {variant.isSoldOut && <span className="ml-2 text-xs font-normal text-red-400">Habis</span>}
                                </span>

                                {!variant.isSoldOut && (
                                  <div className="flex items-center gap-3">
                                    <button
                                      type="button"
                                      onClick={() => updateMerchQty(item.id, variant.id, -1)}
                                      disabled={qty === 0}
                                      className="flex size-7 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition-colors hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-30"
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <span className="w-5 text-center text-sm font-bold text-slate-900">{qty}</span>
                                    <button
                                      type="button"
                                      onClick={() => updateMerchQty(item.id, variant.id, 1)}
                                      disabled={qty >= variant.available}
                                      className="flex size-7 items-center justify-center rounded-full bg-emerald-800 text-white transition-colors hover:bg-emerald-700 disabled:opacity-30"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TERMS & CONDITIONS — selalu tampil supaya bisa dibaca audience */}
            {event.termsConditions && (
              <div className="py-6">
                <h2 className="mb-3 text-base font-bold text-slate-900">Syarat &amp; Ketentuan</h2>
                <div className="whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
                  {event.termsConditions}
                </div>
              </div>
            )}
          </div>
          {/* END LEFT COLUMN */}

          {/* RIGHT COLUMN — sticky order summary + buyer form + buy button */}
          <div className="mt-8 space-y-4 lg:sticky lg:top-4 lg:mt-0">
            {/* Event quick info card — desktop only (duplicates the header on mobile) */}
            <div className="hidden rounded-2xl border border-slate-200 bg-white p-4 lg:block">
              <p className="text-sm font-bold text-slate-900">{event.title}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <Calendar className="h-3 w-3 shrink-0" />
                {formattedDate}
              </div>
              {event.location && (
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {event.location}
                </div>
              )}
            </div>

            {/* ORDER SUMMARY — shown when totalQty > 0 */}
            {totalQty > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-bold text-slate-900">Ringkasan Pesanan</h2>
                <div className="space-y-2 rounded-2xl bg-slate-900 p-4">
                  {totalTicketQty > 0 && (
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Tiket</p>
                  )}
                  {selectedItems.map((item) => {
                    const tt = event.ticketTypes.find((t) => t.id === item.ticketTypeId)!
                    return (
                      <div key={item.ticketTypeId} className="flex justify-between text-sm">
                        <span className="text-slate-400">
                          {item.quantity}× {tt.name}
                        </span>
                        <span className="font-bold text-white">{IDR.format(tt.price * item.quantity)}</span>
                      </div>
                    )
                  })}

                  {totalMerchQty > 0 && (
                    <p className="pt-2 text-xs font-bold uppercase tracking-wide text-slate-400">Merchandise</p>
                  )}
                  {selectedMerch.map((item) => {
                    const mi = event.merchItems.find((m) => m.id === item.itemId)
                    const variant = mi?.variants.find((v) => v.id === item.variantId)
                    if (!mi) return null
                    return (
                      <div key={item.key} className="flex justify-between text-sm">
                        <span className="text-slate-400">
                          {item.quantity}× {mi.name} ({variant?.size})
                        </span>
                        <span className="font-bold text-white">{IDR.format(mi.price * item.quantity)}</span>
                      </div>
                    )
                  })}

                  {feeBearer === "audience" && feeAmount > 0 && (
                    <div className="mt-2 flex justify-between border-t border-slate-700 pt-2 text-sm">
                      <span className="text-slate-400">Biaya layanan ({event.feePercent}%)</span>
                      <span className="text-white">{IDR.format(feeAmount)}</span>
                    </div>
                  )}

                  {taxAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Pajak (10%)</span>
                      <span className="text-white">{IDR.format(taxAmount)}</span>
                    </div>
                  )}

                  <div className="mt-2 flex justify-between border-t border-slate-600 pt-2">
                    <span className="font-bold text-white">Total</span>
                    <span className="text-lg font-black text-emerald-400">{IDR.format(totalAmount)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* BUYER FORM — shown when totalQty > 0 */}
            {totalQty > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="mb-3 text-sm font-bold text-slate-900">Data Pembeli</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nama Lengkap *</label>
                    <input
                      type="text"
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Sesuai KTP"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Email *</label>
                    <input
                      type="email"
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      placeholder="E-ticket dikirim ke email ini"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nomor HP *</label>
                    <input
                      type="tel"
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="08xx atau +628xx"
                      className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  {totalTicketQty > 0 && (
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                        NIK KTP * <span className="ml-1 font-normal normal-case text-slate-400">(16 digit)</span>
                      </label>
                      <input
                        type="text"
                        value={buyerNik}
                        onChange={(e) => setBuyerNik(e.target.value.replace(/\D/g, "").slice(0, 16))}
                        inputMode="numeric"
                        placeholder="Nomor induk kependudukan"
                        maxLength={16}
                        className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        Maks. 4 tiket per NIK per event. Data hanya digunakan untuk verifikasi.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* EMPTY STATE — desktop only, when no tickets selected */}
            {totalQty === 0 && (
              <div className="hidden rounded-2xl border border-slate-200 bg-white p-6 text-center lg:block">
                <Ticket className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-400">Pilih tiket atau merchandise di sebelah kiri untuk melanjutkan</p>
              </div>
            )}

            {formError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>
            )}

            {/* BUY BUTTON — always visible in right column */}
            <button
              type="button"
              onClick={handleBuy}
              disabled={totalQty === 0 || submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-800 py-4 text-base font-black text-white shadow-lg shadow-emerald-800/20 transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? (
                <span>Memproses...</span>
              ) : totalQty > 0 ? (
                <>
                  <Ticket className="h-5 w-5" />
                  Beli Sekarang — {IDR.format(totalAmount)}
                </>
              ) : (
                "Pilih Tiket atau Merchandise"
              )}
            </button>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Shield className="h-3 w-3" />
                Pembayaran aman
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Mail className="h-3 w-3" />
                E-ticket via email
              </div>
            </div>
          </div>
          {/* END RIGHT COLUMN */}
        </div>
      )}

      {/* FOOTER — full width */}
      <div className="mx-auto max-w-5xl px-4">
        <div className="border-t border-slate-200 py-4 text-center">
          <p className="text-xs text-slate-400">
            Powered by <span className="font-bold text-emerald-600">nexEvent</span> — Platform Manajemen Event Indonesia
          </p>
        </div>
      </div>
    </div>
  )
}
