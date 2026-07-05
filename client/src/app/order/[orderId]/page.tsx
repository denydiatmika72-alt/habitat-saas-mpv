"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import Script from "next/script"
import { CheckCircle2, Clock, XCircle, Loader2, MapPin, CalendarDays } from "lucide-react"

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

type Ticket = { id: string; ticketCode: string; attendeeName: string | null; isUsed: boolean }
type OrderItem = { id: string; quantity: number; price: number; ticketType: { name: string; price: number }; tickets: Ticket[] }
type MerchOrderItem = { id: string; quantity: number; price: number; item: { name: string; imageUrl: string | null }; variant: { size: string } }
type Order = {
  orderId: string
  status: "pending" | "paid" | "expired" | "cancelled"
  buyerName: string
  buyerEmail: string
  totalAmount: number
  expiredAt: string
  midtransToken: string | null
  event: { title: string; location: string; event_date: string; slug: string | null }
  items: OrderItem[]
  merchItems?: MerchOrderItem[]
}

const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })

function useCountdown(target: string | null) {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    if (!target) return
    const tick = () => setRemaining(Math.max(0, new Date(target).getTime() - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])
  const minutes = Math.floor(remaining / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)
  return { remaining, label: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` }
}

export default function OrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`/api/storefront/order/${orderId}`)
      const data = await res.json()
      if (!data.success) {
        setNotFound(true)
        return
      }
      setOrder(data.order)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    if (orderId) fetchOrder()
  }, [orderId, fetchOrder])

  useEffect(() => {
    if (order?.status !== "pending") return
    const interval = setInterval(fetchOrder, 5000)
    return () => clearInterval(interval)
  }, [order?.status, fetchOrder])

  const { remaining, label } = useCountdown(order?.status === "pending" ? order.expiredAt : null)

  useEffect(() => {
    if (order?.status === "pending" && remaining === 0) fetchOrder()
  }, [remaining, order?.status, fetchOrder])

  const allTickets = order?.items.flatMap((item) => item.tickets.map((t) => ({ ...t, typeName: item.ticketType.name }))) ?? []
  const waText = order
    ? encodeURIComponent(`Tiket nexEvent saya untuk ${order.event.title}:\n${allTickets.map((t) => t.ticketCode).join(", ")}\n\nCek detail: ${typeof window !== "undefined" ? window.location.href : ""}`)
    : ""

  const resumePayment = () => {
    if (!order?.midtransToken || !window.snap) return
    window.snap.pay(order.midtransToken, {
      onSuccess: fetchOrder,
      onPending: fetchOrder,
      onError: fetchOrder,
    })
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[680px] flex-col bg-white px-4 py-8 sm:px-6">
      <Script
        src="https://app.sandbox.midtrans.com/snap/snap.js"
        data-client-key={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY}
        strategy="afterInteractive"
      />
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-emerald-800" />
        </div>
      )}

      {!loading && (notFound || !order) && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <XCircle className="size-10 text-slate-300" />
          <p className="text-lg font-semibold text-slate-900">Pesanan tidak ditemukan</p>
        </div>
      )}

      {order && (
        <>
          <div className="border-b border-slate-100 pb-6">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{order.event.title}</h1>
            <div className="mt-2 flex flex-col gap-1 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 shrink-0 text-emerald-700" />
                {new Date(order.event.event_date).toLocaleDateString("id-ID", { dateStyle: "long" })}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-emerald-700" />
                {order.event.location}
              </div>
            </div>
          </div>

          {order.status === "pending" && (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
              <Clock className="size-8 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">Menunggu Pembayaran</p>
              <p className="text-2xl font-bold text-amber-800">{remaining > 0 ? label : "00:00"}</p>
              <p className="text-xs text-amber-700">Selesaikan pembayaran sebelum waktu habis, atau pesanan akan otomatis dibatalkan.</p>
              {order.midtransToken && (
                <button
                  onClick={resumePayment}
                  className="mt-2 rounded-lg bg-emerald-800 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
                >
                  Lanjutkan Pembayaran
                </button>
              )}
            </div>
          )}

          {order.status === "expired" && (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
              <XCircle className="size-8 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">Pesanan Telah Kedaluwarsa</p>
              <p className="text-xs text-slate-500">Waktu pembayaran sudah habis. Silakan beli tiket lagi.</p>
              {order.event.slug && (
                <Link href={`/event/${order.event.slug}`} className="mt-2 rounded-lg bg-emerald-800 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-900">
                  Beli Tiket Lagi
                </Link>
              )}
            </div>
          )}

          {order.status === "cancelled" && (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
              <XCircle className="size-8 text-red-500" />
              <p className="text-sm font-semibold text-red-700">Pesanan Dibatalkan</p>
            </div>
          )}

          {order.status === "paid" && (
            <>
              <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
                <CheckCircle2 className="size-8 text-emerald-700" />
                <p className="text-sm font-semibold text-emerald-800">Pembayaran Berhasil</p>
                <p className="text-xs text-emerald-700">Detail pesanan sudah dikirim ke {order.buyerEmail}</p>
              </div>

              {allTickets.length > 0 && (
                <div className="mt-6 flex flex-col gap-3">
                  <p className="text-sm font-semibold text-slate-900">Tiket Anda ({allTickets.length})</p>
                  {allTickets.map((t) => (
                    <div key={t.id} className="rounded-xl border border-slate-200 p-4">
                      <p className="text-xs font-medium text-slate-500">{t.typeName}</p>
                      <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{t.ticketCode}</p>
                    </div>
                  ))}
                </div>
              )}

              {(order.merchItems?.length ?? 0) > 0 && (
                <div className="mt-6 flex flex-col gap-3">
                  <p className="text-sm font-semibold text-slate-900">Merchandise Anda</p>
                  <div className="rounded-xl border border-slate-200 p-4">
                    {order.merchItems!.map((m) => (
                      <p key={m.id} className="text-sm text-slate-600">
                        • {m.item.name} ({m.variant.size}) × {m.quantity}
                      </p>
                    ))}
                    <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                      Tunjukkan barcode pickup di email konfirmasi (Order ID:{" "}
                      <span className="font-mono font-semibold text-slate-700">{order.orderId}</span>) saat pengambilan merchandise di venue.
                    </p>
                  </div>
                </div>
              )}

              <a
                href={`https://wa.me/?text=${waText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
              >
                Bagikan ke WhatsApp
              </a>
            </>
          )}

          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <p className="mb-2 text-sm font-semibold text-slate-900">Ringkasan Pesanan</p>
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm text-slate-600">
                <span>{item.ticketType.name} × {item.quantity}</span>
                <span>{IDR.format(item.price * item.quantity)}</span>
              </div>
            ))}
            {order.merchItems?.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm text-slate-600">
                <span>{m.item.name} ({m.variant.size}) × {m.quantity}</span>
                <span>{IDR.format(m.price * m.quantity)}</span>
              </div>
            ))}
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-sm font-semibold text-slate-900">Total</span>
              <span className="text-lg font-bold text-emerald-800">{IDR.format(order.totalAmount)}</span>
            </div>
          </div>

          <p className="mt-10 pb-2 text-center text-xs text-slate-400">Powered by nexEvent</p>
        </>
      )}
    </div>
  )
}
