"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { Calendar, MapPin, Minus, Plus, Loader2, CheckCircle2, Ticket } from "lucide-react"

type TicketType = {
  id: string
  name: string
  description: string | null
  price: number
  available: number
  isSoldOut: boolean
}

type EventData = {
  id: string
  title: string
  location: string
  event_date: string
  bannerUrl: string | null
  logoUrl: string | null
}

type ResultTicket = { id: string; ticketCode: string; typeName: string; qrDataUrl: string }
type OrderResult = {
  orderId: string
  paymentMethod: "cash" | "transfer"
  buyerName: string
  totalAmount: number
  tickets: ResultTicket[]
}

type Status = "loading" | "not_found" | "active" | "error"

const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })
const MAX_QTY_PER_TYPE = 4

export default function BoxOfficePage() {
  const { eventId } = useParams<{ eventId: string }>()

  const [status, setStatus] = useState<Status>("loading")
  const [event, setEvent] = useState<EventData | null>(null)
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const [buyerName, setBuyerName] = useState("")
  const [buyerEmail, setBuyerEmail] = useState("")
  const [buyerNik, setBuyerNik] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"" | "cash" | "transfer">("")

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState("")
  const [result, setResult] = useState<OrderResult | null>(null)

  const fetchEvent = useCallback(async () => {
    try {
      const res = await fetch(`/api/box-office/${eventId}`)
      const data = await res.json()
      if (!data.success) {
        setStatus("not_found")
        return
      }
      setEvent(data.event)
      setTicketTypes(data.ticketTypes)
      setStatus("active")
    } catch {
      setStatus("error")
    }
  }, [eventId])

  useEffect(() => {
    if (eventId) fetchEvent()
  }, [eventId, fetchEvent])

  const updateQty = (id: string, delta: number) => {
    const tt = ticketTypes.find((t) => t.id === id)
    const max = Math.min(MAX_QTY_PER_TYPE, tt?.available ?? 0)
    setQuantities((prev) => {
      const current = prev[id] || 0
      return { ...prev, [id]: Math.max(0, Math.min(current + delta, max)) }
    })
  }

  const selectedItems = Object.entries(quantities)
    .filter(([, q]) => q > 0)
    .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))
  const totalQty = selectedItems.reduce((s, i) => s + i.quantity, 0)
  const subtotal = selectedItems.reduce((sum, i) => {
    const tt = ticketTypes.find((t) => t.id === i.ticketTypeId)
    return sum + (tt ? tt.price * i.quantity : 0)
  }, 0)

  const handleSubmit = async () => {
    setFormError("")
    if (totalQty === 0) return setFormError("Pilih minimal 1 tiket.")
    if (!buyerName.trim()) return setFormError("Nama pembeli wajib diisi.")
    if (!/^\d{16}$/.test(buyerNik)) return setFormError("NIK harus 16 digit angka.")
    // Email WAJIB — cek kosong dulu, lalu format (pola sama dgn online storefront).
    if (!buyerEmail.trim()) return setFormError("Email wajib diisi untuk pengiriman e-ticket & konfirmasi.")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) return setFormError("Format email tidak valid.")
    if (paymentMethod !== "cash" && paymentMethod !== "transfer") return setFormError("Pilih metode pembayaran (cash / transfer).")

    setSubmitting(true)
    try {
      const res = await fetch(`/api/box-office/${eventId}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketItems: selectedItems,
          buyerName,
          buyerEmail: buyerEmail.trim(),
          buyerNik,
          paymentMethod,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setFormError(data.message || "Gagal membuat pesanan.")
        setSubmitting(false)
        return
      }
      setResult(data)
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

  if (status === "not_found" || status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 px-6 text-center">
        <Ticket className="size-10 text-slate-300" />
        <p className="text-lg font-semibold text-slate-900">Event tidak ditemukan</p>
        <p className="text-sm text-slate-500">Periksa kembali QR / link box office.</p>
      </div>
    )
  }

  // ===== Layar sukses: tampilkan tiket QR langsung untuk di-screenshot pembeli =====
  if (result) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 bg-slate-50 px-4 py-8">
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="size-9 text-emerald-700" />
          <p className="text-base font-bold text-emerald-800">Pembelian Berhasil</p>
          <p className="text-sm text-emerald-700">
            {result.buyerName} — {IDR.format(result.totalAmount)} ({result.paymentMethod === "cash" ? "Tunai" : "Transfer"})
          </p>
          <p className="text-xs text-emerald-600">Screenshot tiket di bawah ini sebagai bukti masuk.</p>
        </div>

        <p className="text-sm font-semibold text-slate-900">Tiket Anda ({result.tickets.length})</p>
        {result.tickets.map((t) => (
          <div key={t.id} className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t.typeName}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.qrDataUrl} alt={t.ticketCode} className="size-48 rounded-lg" />
            <p className="font-mono text-sm font-semibold text-slate-900">{t.ticketCode}</p>
          </div>
        ))}
        <p className="pb-4 pt-2 text-center text-xs text-slate-400">Powered by nexEvent</p>
      </div>
    )
  }

  // ===== Form pembelian =====
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 px-4 py-6">
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
        <span className="mb-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
          Box Office
        </span>
        <h1 className="text-lg font-bold text-slate-900">{event?.title}</h1>
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Calendar className="size-3.5 shrink-0" />
            {event && new Date(event.event_date).toLocaleDateString("id-ID", { dateStyle: "long" })}
          </span>
          {event?.location && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" />
              {event.location}
            </span>
          )}
        </div>
      </div>

      {/* Pilih tiket */}
      <div className="mb-4 flex flex-col gap-2">
        <p className="text-sm font-bold text-slate-900">Pilih Tiket</p>
        {ticketTypes.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-400">
            Belum ada jenis tiket.
          </p>
        )}
        {ticketTypes.map((tt) => {
          const qty = quantities[tt.id] || 0
          return (
            <div
              key={tt.id}
              className={`rounded-2xl border p-4 ${
                tt.isSoldOut ? "border-slate-200 bg-slate-50 opacity-60" : qty > 0 ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">{tt.name}</p>
                  {tt.description && <p className="mt-0.5 text-xs text-slate-400">{tt.description}</p>}
                  <p className="mt-1 text-base font-black text-emerald-700">{IDR.format(tt.price)}</p>
                </div>
                {tt.isSoldOut ? (
                  <span className="shrink-0 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">Habis</span>
                ) : (
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => updateQty(tt.id, -1)}
                      disabled={qty === 0}
                      className="flex size-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 disabled:opacity-30"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="w-5 text-center text-base font-bold text-slate-900">{qty}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(tt.id, 1)}
                      disabled={qty >= Math.min(MAX_QTY_PER_TYPE, tt.available)}
                      className="flex size-8 items-center justify-center rounded-full bg-emerald-800 text-white disabled:opacity-30"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Data pembeli + metode bayar */}
      {totalQty > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-bold text-slate-900">Data Pembeli</p>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nama Lengkap *</label>
            <input
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Nama pembeli"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">NIK KTP * <span className="font-normal normal-case text-slate-400">(16 digit)</span></label>
            <input
              value={buyerNik}
              onChange={(e) => setBuyerNik(e.target.value.replace(/\D/g, "").slice(0, 16))}
              inputMode="numeric"
              maxLength={16}
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Nomor induk kependudukan"
            />
            <p className="mt-1 text-xs text-slate-400">Maks. 4 tiket per NIK per event.</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Email *</label>
            <input
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              type="email"
              required
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="E-ticket & konfirmasi dikirim ke email ini"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Metode Pembayaran *</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["cash", "transfer"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${
                    paymentMethod === m ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"
                  }`}
                >
                  {m === "cash" ? "Tunai (Cash)" : "Transfer"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {formError && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>}

      <div className="sticky bottom-4 mt-auto">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={totalQty === 0 || submitting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-800 py-4 text-base font-black text-white shadow-lg disabled:opacity-40"
        >
          {submitting ? <Loader2 className="size-5 animate-spin" /> : totalQty > 0 ? `Bayar — ${IDR.format(subtotal)}` : "Pilih tiket dulu"}
        </button>
      </div>
    </div>
  )
}
