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

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Calculator, ClipboardList, PackageOpen, ArrowRight, Plus } from "lucide-react"
import { DocumentTable } from "@/components/dashboard/document-table"
import { BudgetAllocationCard } from "@/components/dashboard/budget-donut-chart"
import { SimulationSummaryCard } from "@/components/dashboard/simulation-summary-card"
import PurchaseOrderTab from "@/components/dashboard/PurchaseOrderTab"
import { Button } from "@/components/ui/button"
import { useSelectedEvent } from "@/contexts/event-context"

// Kelas tombol aksi cepat di header — SATU gaya untuk ketiganya supaya tampil
// sebagai grup kohesif (mengikuti gaya tombol "Simulasi Harga Tiket" lama).
const QUICK_ACTION_CLASS =
  "gap-2 border-slate-200 bg-white text-slate-900 hover:bg-slate-100"

export default function PerencanaanPage() {
  const { selectedEventId } = useSelectedEvent()
  // Counter sinyal untuk membuka modal "Buat PO" di PurchaseOrderTab (jauh di
  // bawah halaman) dari tombol header — reuse handler internal tab, bukan duplikat.
  const [poCreateSignal, setPoCreateSignal] = useState(0)

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

        {/* Baris 3 aksi cepat (konsolidasi 2026-07-22 — menggantikan tombol
            tunggal "Simulasi Harga Tiket"; tombol "Buka Simulasi" di kartu
            ringkasan simulasi ikut dihapus karena redundan):
            - Kelola RAB  → /dashboard/rab/[eventId] (pola SAMA dgn tombol di
              baris tabel DocumentTable — halaman RAB sendiri yang menangani
              kasus "belum ada RAB"); disabled tanpa event terpilih.
            - Simulasi    → /dashboard/simulasi (tujuan lama, tidak berubah).
            - Buat PO     → buka modal "Buat PO Baru" milik PurchaseOrderTab
              via createSignal (bukan flow duplikat); disabled tanpa event. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">
          {selectedEventId ? (
            <Link href={`/dashboard/rab/${selectedEventId}`}>
              <Button variant="outline" className={QUICK_ACTION_CLASS}>
                <ClipboardList className="size-4" />
                Kelola RAB
              </Button>
            </Link>
          ) : (
            <Button
              variant="outline"
              disabled
              title="Pilih event terlebih dahulu di Dashboard"
              className={QUICK_ACTION_CLASS}
            >
              <ClipboardList className="size-4" />
              Kelola RAB
            </Button>
          )}

          <Link href="/dashboard/simulasi">
            <Button variant="outline" className={QUICK_ACTION_CLASS}>
              <Calculator className="size-4" />
              Simulasi Harga Tiket
            </Button>
          </Link>

          <Button
            variant="outline"
            disabled={!selectedEventId}
            title={selectedEventId ? undefined : "Pilih event terlebih dahulu di Dashboard"}
            className={QUICK_ACTION_CLASS}
            onClick={() => setPoCreateSignal((s) => s + 1)}
          >
            <Plus className="size-4" />
            Buat PO
          </Button>
        </div>
      </div>

      {/* ── RAB event aktif ──────────────────────────────────────────────── */}
      {/* Panel "Data Event Terkunci" (ajuan ubah/hapus + riwayat) DIPINDAH ke
          /dashboard/setup-event pada 2026-07-21 — halaman ini kembali fokus
          murni ke perencanaan anggaran. JANGAN dikembalikan ke sini. */}
      <DocumentTable />

      {/* ── Distribusi Biaya Event (donut alokasi RAB) ───────────────────────
          Dipulihkan 2026-07-21: chart ini hilang tanpa sengaja saat /dashboard
          ditulis ulang jadi Dashboard KPI (commit 0842e0d). */}
      {selectedEventId && <BudgetAllocationCard eventId={selectedEventId} />}

      {/* ── Ringkasan Simulasi Harga Tiket (hasil terakhir) ──────────────────
          Cerminan hasil halaman /dashboard/simulasi tanpa harus membukanya.
          Sengaja DI BAWAH donut RAB (permintaan founder 2026-07-22). */}
      {selectedEventId && <SimulationSummaryCard eventId={selectedEventId} />}

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
            <PurchaseOrderTab eventId={selectedEventId} createSignal={poCreateSignal} />
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
