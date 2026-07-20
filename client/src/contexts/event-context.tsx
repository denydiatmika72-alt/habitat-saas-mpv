"use client"

// ============================================================================
// EventProvider — SATU-SATUNYA sumber kebenaran pemilihan event di /dashboard
// ----------------------------------------------------------------------------
// Menggantikan pola lama "tiap hub kategori punya useState + dropdown sendiri"
// (lihat CLAUDE.md "Roadmap Navigasi 3-Lapis" — pola per-kategori itu SUDAH
// DIGANTIKAN oleh provider ini). Event dipilih SEKALI di Dashboard KPI
// (/dashboard), lalu seluruh halaman turunan membacanya lewat useSelectedEvent().
//
// Aturan sinkronisasi state ↔ URL (?eventId=):
//  1. URL MENANG kalau paramnya ada — deep-link / tombol Back & Forward browser
//     selalu menentukan event yang aktif.
//  2. STATE MENANG kalau URL tidak punya param — begitu user pindah halaman lewat
//     <Link> polos, provider menuliskan kembali pilihan yang tersimpan ke URL
//     (router.replace, BUKAN push, supaya riwayat browser tidak membengkak).
// Karena provider dipasang di layout, state-nya BERTAHAN melintasi navigasi
// client-side di dalam /dashboard (layout tidak re-mount).
//
// PENTING untuk halaman ber-guard "tanpa event → redirect balik ke hub":
// baca `selectedEventId` dari context ini, JANGAN dari searchParams langsung.
// URL menyusul satu tick setelah navigasi, jadi guard berbasis URL bisa salah
// memantulkan user padahal event sebenarnya sudah terpilih (race condition).
//
// PENGECUALIAN: /dashboard/payout sengaja BEBAS event (saldo & pengajuan
// pencairan lintas-event). Provider tidak pernah menulis ?eventId= ke URL-nya.
// JANGAN "perbaiki" ini — lihat komentar di payout/page.tsx.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  Suspense,
} from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/** Route yang TIDAK boleh diberi ?eventId= oleh provider (bebas-event by design). */
const EVENT_FREE_PATHS = ["/dashboard/payout"]

interface EventContextValue {
  /** Event yang sedang aktif. String kosong = belum ada yang dipilih. */
  selectedEventId: string
  /** Ganti event aktif; ikut menulis ?eventId= ke URL (replace). */
  setSelectedEventId: (id: string) => void
}

const EventContext = createContext<EventContextValue | null>(null)

function EventProviderInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const urlEventId = searchParams.get("eventId") ?? ""
  const [selectedEventId, setSelectedEventIdState] = useState(urlEventId)

  const isEventFreePath = EVENT_FREE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )

  /** Bangun query string baru dari yang sekarang, dengan eventId di-set/di-hapus. */
  const buildUrl = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (id) params.set("eventId", id)
      else params.delete("eventId")
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : pathname
    },
    [pathname, searchParams],
  )

  const setSelectedEventId = useCallback(
    (id: string) => {
      setSelectedEventIdState(id)
      if (!isEventFreePath) router.replace(buildUrl(id), { scroll: false })
    },
    [buildUrl, isEventFreePath, router],
  )

  // Aturan 1 — URL menang saat paramnya ada (deep-link, Back/Forward).
  useEffect(() => {
    if (urlEventId && urlEventId !== selectedEventId) {
      setSelectedEventIdState(urlEventId)
    }
  }, [urlEventId, selectedEventId])

  // Aturan 2 — state menang saat URL kosong: tulis balik pilihan tersimpan.
  // Dilewati di route bebas-event (payout) supaya URL-nya tetap bersih.
  useEffect(() => {
    if (isEventFreePath) return
    if (!urlEventId && selectedEventId) {
      router.replace(buildUrl(selectedEventId), { scroll: false })
    }
  }, [urlEventId, selectedEventId, isEventFreePath, buildUrl, router])

  const value = useMemo(
    () => ({ selectedEventId, setSelectedEventId }),
    [selectedEventId, setSelectedEventId],
  )

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>
}

export function EventProvider({ children }: { children: React.ReactNode }) {
  // useSearchParams (Next 16) WAJIB di bawah <Suspense> — tanpa ini build produksi
  // gagal dengan "Missing Suspense boundary with useSearchParams".
  // fallback SENGAJA null, BUKAN {children}: kalau children dirender di fallback
  // mereka berada DI LUAR provider → useSelectedEvent() melempar error.
  return (
    <Suspense fallback={null}>
      <EventProviderInner>{children}</EventProviderInner>
    </Suspense>
  )
}

export function useSelectedEvent(): EventContextValue {
  const ctx = useContext(EventContext)
  if (!ctx) {
    throw new Error("useSelectedEvent harus dipakai di dalam <EventProvider> (app/dashboard/layout.tsx).")
  }
  return ctx
}
