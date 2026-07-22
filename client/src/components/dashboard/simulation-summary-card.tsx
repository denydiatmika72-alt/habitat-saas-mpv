"use client"

// ============================================================================
// SimulationSummaryCard — ringkasan HASIL simulasi harga tiket terakhir.
// ----------------------------------------------------------------------------
// Menampilkan snapshot BEP + rekomendasi harga tier untuk event aktif, TANPA
// perlu membuka halaman Simulasi. Sumbernya GET /api/ticket-simulation?eventId=
// (baris latest-wins yang ditulis halaman Simulasi saat slider digeser).
//
// Refetch: komponen mengambil data di useEffect ber-key `eventId`. Karena halaman
// Perencanaan remount tiap kali dinavigasi (App Router), kembali dari Simulasi →
// remount → fetch ulang → angka selalu yang terbaru. Tidak ada cache manual.
//
// Keselamatan loop: efek fetch HANYA bergantung `eventId` (string primitif) —
// tidak ada dependency yang identitasnya berubah tiap render.
// ============================================================================

import { useEffect, useState } from "react"
import axios from "axios"
import Link from "next/link"
import { Calculator, ArrowRight, Ticket, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProLockPanel } from "@/components/dashboard/pro-lock"

interface SimulationData {
  bepTickets: number
  bepRevenue: number
  priceEarlybird: number
  pricePresale: number
  priceNormal: number
  projectedRevenue: number
  capacity: number
  updatedAt: string
}

function formatRupiah(num: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Math.max(0, num))
}

function formatCompact(num: number) {
  if (num >= 1e9) return `Rp ${(num / 1e9).toFixed(2)} Miliar`
  if (num >= 1e6) return `Rp ${(num / 1e6).toFixed(1)} Juta`
  return formatRupiah(num)
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value))
}

const TIERS = [
  { key: "priceEarlybird", label: "Early Bird", text: "text-sky-600", chip: "bg-sky-50 text-sky-700 border-sky-200" },
  { key: "pricePresale", label: "Presale", text: "text-indigo-600", chip: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { key: "priceNormal", label: "Normal", text: "text-fuchsia-600", chip: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
] as const

export function SimulationSummaryCard({ eventId }: { eventId: string }) {
  const [data, setData] = useState<SimulationData | null>(null)
  const [loading, setLoading] = useState(true)
  // 402 dari requireActivePro = event belum Pro → gembok upgrade (ProLockPanel),
  // BUKAN empty state "belum ada simulasi". Dua kondisi itu dulu tercampur —
  // menyembunyikan peluang upgrade dari user Starter (lihat known-bugs 2026-07-22).
  const [proLocked, setProLocked] = useState(false)

  useEffect(() => {
    if (!eventId) {
      setData(null)
      setProLocked(false)
      setLoading(false)
      return
    }
    const token = localStorage.getItem("token")
    setLoading(true)
    setProLocked(false)
    let cancelled = false
    axios
      .get(`/api/ticket-simulation?eventId=${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (cancelled) return
        // 200 dgn data:null = event Pro aktif tapi belum pernah simulasi → empty state.
        setData(res.data?.data ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        setData(null)
        // HANYA 402 yang berarti "belum Pro". 404 / error jaringan tetap jatuh
        // ke empty state generik — tidak ada hubungannya dengan status Pro.
        const status = axios.isAxiosError(err) ? err.response?.status : undefined
        if (status === 402) setProLocked(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [eventId])

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start gap-3 border-b border-slate-200 p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
          <Calculator className="size-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Ringkasan Simulasi Harga Tiket
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Hasil terbaru dari Simulasi Harga Tiket untuk event ini.
          </p>
        </div>
        {/* Tombol "Buka Simulasi" DIHAPUS 2026-07-22 — redundan dgn tombol
            "Simulasi Harga Tiket" di baris aksi header halaman Perencanaan.
            Tombol empty-state "Buat Simulasi Harga Tiket" di bawah TETAP ada. */}
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin text-slate-400" />
            Memuat ringkasan simulasi…
          </div>
        ) : proLocked ? (
          <ProLockPanel
            eventId={eventId}
            featureName="Simulasi Harga Tiket"
            description="Event ini belum aktif Pro. Simulasi Harga Tiket & ringkasannya khusus Pro — upgrade untuk membuka fitur ini untuk event terpilih."
          />
        ) : !data ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <Ticket className="size-8 text-slate-300" />
            <p className="max-w-sm text-sm text-slate-500">
              Belum ada simulasi harga tiket untuk event ini. Atur target profit &amp; tiering
              gelombang untuk melihat rekomendasi harga dan titik balik modal.
            </p>
            <Link href="/dashboard/simulasi">
              <Button
                variant="outline"
                className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                Buat Simulasi Harga Tiket
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Headline: BEP + total proyeksi */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-600">
                  Break-Even Point (Balik Modal)
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-slate-900">
                    {data.bepTickets.toLocaleString("id-ID")}
                  </span>
                  <span className="text-sm text-slate-500">tiket terjual</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Menutup Grand Total RAB {formatCompact(data.bepRevenue)}
                  {data.capacity > 0 &&
                    ` · ${Math.min(100, Math.round((data.bepTickets / data.capacity) * 100))}% dari kapasitas`}
                </p>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-emerald-700">
                  Total Proyeksi Pendapatan
                </p>
                <div className="mt-2">
                  <span className="text-2xl font-bold tracking-tight text-slate-900">
                    {formatCompact(data.projectedRevenue)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Estimasi tiket terjual + sponsor pada setelan terakhir.
                </p>
              </div>
            </div>

            {/* Rekomendasi harga per tier */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {TIERS.map((tier) => (
                <div key={tier.key} className="rounded-xl border border-slate-200 p-4">
                  <span
                    className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${tier.chip}`}
                  >
                    {tier.label}
                  </span>
                  <p className={`mt-2 text-xl font-bold tracking-tight ${tier.text}`}>
                    {formatRupiah(data[tier.key])}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400">
              Diperbarui {formatUpdatedAt(data.updatedAt)}. Ubah setelan di halaman Simulasi
              untuk memperbarui angka ini.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
