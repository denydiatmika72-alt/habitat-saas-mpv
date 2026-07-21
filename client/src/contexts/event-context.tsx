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
//
// ⚠️ BUG KRITIS 2026-07-21 — JANGAN ULANGI (lihat docs/known-bugs.md):
// Dulu Aturan 1 memperlakukan `?eventId=` yang TIDAK KOSONG sebagai otoritatif
// TANPA SYARAT. Akibatnya pilihan event MUSTAHIL dibersihkan: begitu konsumen
// memanggil setSelectedEventId(""), `router.replace` baru landing beberapa tick
// kemudian, jadi pada render berikutnya URL MASIH memuat id lama → Aturan 1
// menghidupkannya kembali → konsumen membersihkannya lagi → loop tak berujung
// (ratusan GET /api/events per detik sampai browser kehabisan koneksi).
// Dua penjaga di bawah menutup itu: `pendingUrlIdRef` (URL belum menyusul =
// belum otoritatif) dan `deadEventIdsRef` (event yang terbukti sudah dihapus
// tidak boleh dihidupkan ulang dari URL). Keduanya WAJIB dipertahankan.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  /**
   * Tandai sebuah event sebagai SUDAH TIDAK ADA (mis. dihapus lewat persetujuan
   * admin). Ini operasi TERMINAL & IDEMPOTEN: pemanggilan kedua untuk id yang
   * sama tidak melakukan apa pun. Pakai INI — bukan `setSelectedEventId("")` —
   * saat event terpilih tidak ditemukan lagi di daftar `/api/events`, supaya
   * pilihannya tidak dihidupkan kembali dari `?eventId=` yang masih tertinggal
   * di URL (penyebab loop tak berujung di bug 2026-07-21).
   */
  invalidateEvent: (id: string) => void
}

const EventContext = createContext<EventContextValue | null>(null)

function EventProviderInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const urlEventId = searchParams.get("eventId") ?? ""
  const [selectedEventId, setSelectedEventIdState] = useState(urlEventId)

  // Pilihan yang KITA anggap benar saat ini. Ini yang dipakai kedua aturan di
  // bawah untuk mengambil keputusan — BUKAN `selectedEventId`.
  //
  // Alasannya (terbukti di probe browser): setState dan router.replace TIDAK
  // selalu landing di render yang sama. Ada render di mana URL sudah bersih tapi
  // `selectedEventId` masih memuat id lama. Aturan 2 yang membaca state basah itu
  // menyimpulkan "URL kosong tapi ada pilihan" lalu MENULIS BALIK id yang baru
  // saja dibuang — persis mekanisme kebangkitan yang bikin loop. Ref di-update
  // secara sinkron di commitSelection, jadi ia tidak pernah basi.
  const intendedIdRef = useRef(urlEventId)

  // Id yang SEDANG dalam perjalanan ke URL: kita sudah memanggil router.replace,
  // tapi searchParams belum menyusul. Selama itu `urlEventId` masih nilai LAMA
  // dan TIDAK boleh dianggap otoritatif oleh Aturan 1. `null` = URL sinkron.
  const pendingUrlIdRef = useRef<string | null>(null)

  // Id event yang terbukti sudah tidak ada lagi. Ref (bukan state) karena
  // fungsinya hanya MEMBLOKIR hidrasi-ulang dari URL — tidak boleh memicu render.
  const deadEventIdsRef = useRef<Set<string>>(new Set())

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

  /** Kirim `id` ke URL sambil menandai bahwa URL belum sinkron. */
  const pushToUrl = useCallback(
    (id: string) => {
      pendingUrlIdRef.current = id
      router.replace(buildUrl(id), { scroll: false })
    },
    [buildUrl, router],
  )

  /** Terapkan pilihan baru ke state + URL sekaligus, dengan menandai URL "belum sinkron". */
  const commitSelection = useCallback(
    (id: string) => {
      intendedIdRef.current = id
      setSelectedEventIdState(id)
      if (isEventFreePath) {
        // Route bebas-event tidak pernah menulis ?eventId= → tidak ada URL yang
        // perlu ditunggu, jadi jangan pasang penanda pending (nanti menggantung).
        pendingUrlIdRef.current = null
        return
      }
      pushToUrl(id)
    },
    [isEventFreePath, pushToUrl],
  )

  const setSelectedEventId = useCallback(
    (id: string) => {
      // Pemilihan eksplisit oleh user membatalkan status "dead" (mis. event dibuat
      // ulang dengan id yang sama, atau daftar sempat gagal dimuat).
      if (id) deadEventIdsRef.current.delete(id)
      commitSelection(id)
    },
    [commitSelection],
  )

  const invalidateEvent = useCallback(
    (id: string) => {
      // TERMINAL: sekali ditandai mati, pemanggilan berikutnya no-op. Inilah yang
      // memutus loop — konsumen boleh memanggil ini berkali-kali (identitas
      // callback berubah tiap searchParams berubah) tanpa efek berulang.
      if (!id || deadEventIdsRef.current.has(id)) return
      deadEventIdsRef.current.add(id)
      // Hanya bersihkan kalau yang mati memang yang sedang aktif.
      if (id === intendedIdRef.current || id === urlEventId) commitSelection("")
    },
    [commitSelection, urlEventId],
  )

  // Aturan 1 — URL menang saat paramnya ada (deep-link, Back/Forward).
  // Perhatikan: efek ini membandingkan URL dengan intendedIdRef, BUKAN dengan
  // `selectedEventId`, dan karena itu tidak lagi ikut bergantung pada state.
  useEffect(() => {
    // (a) URL belum menyusul perubahan yang baru kita kirim → jangan baca URL,
    //     nilainya masih yang LAMA. Begitu cocok, tandai URL sudah sinkron.
    if (pendingUrlIdRef.current !== null) {
      if (urlEventId === pendingUrlIdRef.current) pendingUrlIdRef.current = null
      return
    }
    // (b) URL sudah sesuai niat kita → tidak ada yang perlu dikerjakan.
    if (urlEventId === intendedIdRef.current) return
    // (c) Event terbukti sudah dihapus → JANGAN dihidupkan lagi dari URL, dan
    //     buang sisa param-nya sekali saja supaya URL tidak menyesatkan.
    if (urlEventId && deadEventIdsRef.current.has(urlEventId)) {
      pushToUrl(intendedIdRef.current)
      return
    }
    // (d) URL kosong ditangani Aturan 2 (state menang), bukan di sini.
    if (!urlEventId) return
    // (e) Navigasi eksternal sungguhan (deep-link / Back / Forward) → adopsi.
    intendedIdRef.current = urlEventId
    setSelectedEventIdState(urlEventId)
  }, [urlEventId, pushToUrl])

  // Aturan 2 — state menang saat URL kosong: tulis balik pilihan tersimpan.
  // Dilewati di route bebas-event (payout) supaya URL-nya tetap bersih.
  useEffect(() => {
    if (isEventFreePath) return
    // URL sedang menyusul perubahan kita → menulis lagi di sini akan saling
    // menimpa dengan Aturan 1 (inti dari loop 2026-07-21).
    if (pendingUrlIdRef.current !== null) return
    // intendedIdRef, BUKAN selectedEventId: pada render tepat setelah pilihan
    // dibersihkan, state masih memuat id lama sementara URL sudah bersih —
    // membacanya di sini akan MENULIS BALIK id yang baru saja dibuang.
    if (!urlEventId && intendedIdRef.current) {
      pushToUrl(intendedIdRef.current)
    }
  }, [urlEventId, selectedEventId, isEventFreePath, pushToUrl])

  const value = useMemo(
    () => ({ selectedEventId, setSelectedEventId, invalidateEvent }),
    [selectedEventId, setSelectedEventId, invalidateEvent],
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
