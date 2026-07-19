"use client"

import { useState } from "react"
import Link from "next/link"
import { Lock, X, Sparkles } from "lucide-react"

// Reusable gating UI untuk fitur Pro PER-EVENT.
// Bukan "sembunyikan total" dan bukan "buka total" — tampilkan fitur tapi terkunci:
// ikon gembok + klik → modal "Fitur ini khusus Pro. Upgrade untuk event ini?" + tombol ke halaman bayar.
// Backend (requireActivePro) tetap sumber kebenaran; ini murni UX.

export function ProLockModal({
  open,
  onClose,
  eventId,
  featureName = "Fitur ini",
}: {
  open: boolean
  onClose: () => void
  eventId?: string | null
  featureName?: string
}) {
  if (!open) return null
  const href = eventId ? `/dashboard/upgrade?eventId=${eventId}` : "/dashboard/upgrade"
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50">
              <Lock className="size-5 text-emerald-800" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Fitur Khusus Pro</h2>
              <p className="text-sm text-slate-500">Aktif per-event</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="text-slate-400 transition-colors hover:text-slate-700"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-slate-600">
          {featureName} khusus Pro. Upgrade untuk event ini untuk membukanya — Pro aktif 90 hari
          sejak pembayaran (Rp 499.000), bisa diperpanjang.
        </p>

        <div className="flex flex-col gap-2">
          <Link
            href={href}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-6 py-3 font-bold text-white transition-colors hover:bg-emerald-900"
          >
            <Sparkles className="size-4" />
            Upgrade untuk event ini →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Nanti saja
          </button>
        </div>
      </div>
    </div>
  )
}

// Panel gembok besar untuk menggantikan area fitur yang terkunci (mis. hasil kalkulator).
// Klik → buka ProLockModal.
export function ProLockPanel({
  eventId,
  featureName = "Fitur ini",
  description,
}: {
  eventId?: string | null
  featureName?: string
  description?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-emerald-800/30 bg-emerald-50/40 p-10 text-center transition-colors hover:bg-emerald-50"
      >
        <div className="flex size-14 items-center justify-center rounded-xl bg-emerald-50">
          <Lock className="size-7 text-emerald-800" />
        </div>
        <div>
          <p className="text-lg font-bold text-slate-900">{featureName} — Khusus Pro</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
            {description ?? "Event ini belum aktif Pro. Klik untuk upgrade dan membuka fitur ini."}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white">
          <Sparkles className="size-4" />
          Upgrade untuk event ini
        </span>
      </button>
      <ProLockModal open={open} onClose={() => setOpen(false)} eventId={eventId} featureName={featureName} />
    </>
  )
}
