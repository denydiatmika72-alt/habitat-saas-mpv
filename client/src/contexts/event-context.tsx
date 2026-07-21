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

/** Ke mana user dikembalikan saat event yang sedang dibuka ternyata sudah dihapus. */
export const DEAD_EVENT_FALLBACK_HREF = "/dashboard"

/** Pesan tunggal yang dipakai seluruh dashboard — jangan tulis varian sendiri per halaman. */
export const DEAD_EVENT_MESSAGE =
  "Event ini sudah tidak tersedia (mungkin telah dihapus). Silakan pilih event lain."

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
  /**
   * Apakah `id` sudah ditandai mati lewat `invalidateEvent`? Versi REAKTIF dari
   * `deadEventIdsRef` — didukung state, jadi komponen yang memanggilnya ikut
   * re-render saat sebuah event ditandai mati. (Ref-nya sendiri tetap ada karena
   * Aturan 1 butuh pembacaan SINKRON sebelum render di-commit.)
   */
  isEventDead: (id: string) => boolean
  /** Pesan "event sudah dihapus" yang perlu ditampilkan, atau null. */
  deadEventNotice: string | null
  /** Tutup pesan di atas. */
  dismissDeadEventNotice: () => void
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

  // Id event yang terbukti sudah tidak ada lagi.
  // DUA salinan yang disengaja, jangan disatukan:
  //  - ref  → dibaca SINKRON oleh Aturan 1 (harus valid sebelum render di-commit)
  //  - state→ supaya `isEventDead` reaktif bagi konsumen (ref tidak memicu render)
  // Keduanya HANYA ditulis di `invalidateEvent`/`setSelectedEventId`, jadi tidak
  // bisa menyimpang satu sama lain.
  const deadEventIdsRef = useRef<Set<string>>(new Set())
  const [deadEventIds, setDeadEventIds] = useState<ReadonlySet<string>>(() => new Set())

  // Pesan yang ditampilkan setelah user dilempar balik dari event yang sudah
  // dihapus. Disimpan di provider (BUKAN di halaman asal) karena halaman asal
  // langsung di-unmount saat redirect — pesannya harus ikut selamat ke tujuan.
  // Ini bekerja karena EventProvider dipasang di layout /dashboard, yang TIDAK
  // re-mount saat navigasi client-side.
  const [deadEventNotice, setDeadEventNotice] = useState<string | null>(null)

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
      if (id && deadEventIdsRef.current.delete(id)) {
        setDeadEventIds(new Set(deadEventIdsRef.current))
      }
      // User sudah memilih event lain → penjelasan soal event lama tidak relevan lagi.
      setDeadEventNotice(null)
      commitSelection(id)
    },
    [commitSelection],
  )

  const invalidateEvent = useCallback(
    (id: string) => {
      // TERMINAL: sekali ditandai mati, pemanggilan berikutnya no-op. Inilah yang
      // memutus loop — konsumen boleh memanggil ini berkali-kali (identitas
      // callback berubah tiap searchParams berubah) tanpa efek berulang.
      // Konsekuensinya `deadEventNotice` juga hanya diset SEKALI per event.
      if (!id || deadEventIdsRef.current.has(id)) return
      deadEventIdsRef.current.add(id)
      setDeadEventIds(new Set(deadEventIdsRef.current))
      setDeadEventNotice(DEAD_EVENT_MESSAGE)
      // Hanya bersihkan kalau yang mati memang yang sedang aktif.
      if (id === intendedIdRef.current || id === urlEventId) commitSelection("")
    },
    [commitSelection, urlEventId],
  )

  const isEventDead = useCallback(
    (id: string) => Boolean(id) && deadEventIds.has(id),
    [deadEventIds],
  )

  const dismissDeadEventNotice = useCallback(() => setDeadEventNotice(null), [])

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
    () => ({
      selectedEventId,
      setSelectedEventId,
      invalidateEvent,
      isEventDead,
      deadEventNotice,
      dismissDeadEventNotice,
    }),
    [
      selectedEventId,
      setSelectedEventId,
      invalidateEvent,
      isEventDead,
      deadEventNotice,
      dismissDeadEventNotice,
    ],
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

// ============================================================================
// useEventGuard — penjaga tunggal untuk halaman yang butuh event aktif
// ----------------------------------------------------------------------------
// Menangani DUA kondisi yang dulu ditulis ulang-ulang (atau tidak ditangani
// sama sekali) di tiap halaman:
//
//   1. BELUM ADA event terpilih  → balik ke hub kategori (`emptyHref`), kalau
//      halaman ini memang tidak berguna tanpa event. Halaman hub sendiri
//      (Kerjasama/Ticketing/Keuangan) TIDAK mengoper `emptyHref` — mereka
//      menampilkan empty state, bukan memantulkan user.
//   2. Event terpilih SUDAH DIHAPUS → tandai mati, kembalikan ke Dashboard KPI,
//      dan munculkan penjelasan lewat `deadEventNotice`. Ini yang menutup celah
//      UX dari fix loop 2026-07-21 (halaman turunan dulu cuma diam & kosong).
//
// ⚠️ KESELAMATAN LOOP (kelas bug yang sama dengan insiden 2026-07-21 — baca
// docs/known-bugs.md sebelum mengubah efek di bawah):
//   - `isDead`/`isMissing` sengaja dihitung jadi BOOLEAN primitif. Jangan ganti
//     jadi objek/array — dependency yang identitasnya berubah tiap render akan
//     menjalankan ulang efek ini tanpa henti.
//   - `firedRef` membuat redirect terjadi TEPAT SEKALI per mount. Ini penjaga
//     terminal-nya: walaupun efek dijalankan ulang (identitas `invalidateEvent`
//     memang berubah tiap `searchParams` berubah), aksinya tidak pernah berulang.
//   - Deteksi HARUS menunggu `ready` (daftar event selesai dimuat DENGAN SUKSES).
//     Daftar kosong karena request gagal BUKAN bukti event terhapus.
// ============================================================================
export function useEventGuard(options: {
  /** Daftar event milik user yang sudah dimuat halaman ini. */
  events: ReadonlyArray<{ id: string | number }>
  /** true HANYA kalau pengambilan daftar event SUKSES (bukan sekadar "selesai"). */
  ready: boolean
  /** Kalau diisi: redirect ke sini saat belum ada event terpilih. */
  emptyHref?: string
}): { isDeadEvent: boolean } {
  const { events, ready, emptyHref } = options
  const { selectedEventId, invalidateEvent } = useSelectedEvent()
  const router = useRouter()
  const firedRef = useRef(false)

  // Event terpilih tidak ada di daftar milik user → sudah dihapus.
  // Catatan: daftar KOSONG pun dihitung mati selama `ready` true — user yang
  // menghapus satu-satunya event-nya tetap harus dilempar balik, bukan dibiarkan
  // menatap halaman kosong. Itulah kenapa `ready` wajib berarti "sukses".
  const isDeadEvent =
    ready &&
    Boolean(selectedEventId) &&
    !events.some((e) => String(e.id) === selectedEventId)

  const isMissing = Boolean(emptyHref) && !selectedEventId

  useEffect(() => {
    if (firedRef.current) return

    if (isMissing && emptyHref) {
      firedRef.current = true
      router.replace(emptyHref)
      return
    }

    if (isDeadEvent) {
      firedRef.current = true
      // Idempoten & terminal: membersihkan pilihan + memasang pesan sekali saja.
      invalidateEvent(selectedEventId)
      router.replace(DEAD_EVENT_FALLBACK_HREF)
    }
    // `invalidateEvent` sengaja TIDAK masuk deps: identitasnya berubah tiap
    // searchParams berubah, dan `firedRef` sudah menjamin sekali-jalan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDeadEvent, isMissing, emptyHref, selectedEventId, router])

  return { isDeadEvent }
}
