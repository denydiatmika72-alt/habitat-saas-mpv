"use client"

// ============================================================================
// Dashboard Perencanaan — hub kategori "Perencanaan" (Layer 2).
// ----------------------------------------------------------------------------
// Isi: indeks RAB per event (pindahan dari /dashboard), Purchase Order
// (pindahan dari halaman Invoice — PO adalah alat perencanaan belanja, bukan
// dokumen kerjasama), dan pintu ke Simulasi Harga Tiket.
//
// Event TIDAK dipilih di sini — diwarisi dari Dashboard KPI lewat EventProvider.
// Halaman ini SENGAJA tidak me-redirect saat belum ada event terpilih: tabel RAB
// tetap berguna sebagai indeks lintas-event (satu RAB per event), hanya seksi PO
// yang butuh event aktif.
// ============================================================================

import Link from "next/link"
import { ArrowLeft, Calculator, ClipboardList, PackageOpen, ArrowRight } from "lucide-react"
import { DocumentTable } from "@/components/dashboard/document-table"
import { BudgetAllocationCard } from "@/components/dashboard/budget-donut-chart"
import PurchaseOrderTab from "@/components/dashboard/PurchaseOrderTab"
import { Button } from "@/components/ui/button"
import { useSelectedEvent } from "@/contexts/event-context"

export default function PerencanaanPage() {
  const { selectedEventId } = useSelectedEvent()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* ── Kembali ke hub utama ─────────────────────────────────────────── */}
      <Link
        href="/dashboard"
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="size-4" />
        Kembali ke Dashboard
      </Link>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-800">
            Perencanaan
          </p>
          <h1 className="mt-2 text-pretty text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            Dashboard Perencanaan
          </h1>
          <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-slate-500">
            Rancang anggaran (RAB), terbitkan Purchase Order, dan simulasikan harga tiket sebelum event berjalan.
          </p>
        </div>

        <Link href="/dashboard/simulasi" className="shrink-0 print:hidden">
          <Button variant="outline" className="gap-2 border-slate-200 bg-white text-slate-900 hover:bg-slate-100">
            <Calculator className="size-4" />
            Simulasi Harga Tiket
          </Button>
        </Link>
      </div>

      {/* ── RAB event aktif ──────────────────────────────────────────────── */}
      <DocumentTable />

      {/* ── Distribusi Biaya Event (donut alokasi RAB) ───────────────────────
          Dipulihkan 2026-07-21: chart ini hilang tanpa sengaja saat /dashboard
          ditulis ulang jadi Dashboard KPI (commit 0842e0d). */}
      {selectedEventId && <BudgetAllocationCard eventId={selectedEventId} />}

      {/* ── Purchase Order (per event aktif) ─────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-start gap-3 border-b border-slate-200 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <PackageOpen className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Purchase Order</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              PO untuk event yang sedang aktif. Item bisa diimpor langsung dari RAB.
            </p>
          </div>
        </div>

        <div className="p-5">
          {selectedEventId ? (
            <PurchaseOrderTab eventId={selectedEventId} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <ClipboardList className="size-8 text-slate-300" />
              <p className="text-sm text-slate-500">
                Pilih event terlebih dahulu untuk mengelola Purchase Order.
              </p>
              <Link href="/dashboard">
                <Button variant="outline" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                  Pilih event di Dashboard
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
