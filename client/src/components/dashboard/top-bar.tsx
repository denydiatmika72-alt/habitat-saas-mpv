"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Search, LogOut, Settings2, CalendarDays, Handshake, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useUser } from "@/hooks/useUser"

// ── Pencarian global top-bar ─────────────────────────────────────────────────
// Memanggil GET /api/search?q= (search.controller.js) — hasilnya event & deal
// sponsor MILIK promotor login saja (di-scope server-side).
//
// PENTING: TopBar dirender DI LUAR <EventProvider> (lihat komentar di
// app/dashboard/layout.tsx — sengaja, TopBar tidak bergantung event). Jadi kita
// TIDAK bisa memanggil useSelectedEvent() di sini. Cara set event aktif dari
// hasil pencarian: navigasi dengan ?eventId= — itu jalur deep-link resmi yang
// diadopsi provider lewat "Aturan 1: URL menang" di event-context.tsx.
//
// Komponen ini top-level modul (BUKAN di dalam TopBar) — aturan CLAUDE.md soal
// komponen inline yang bikin remount + kehilangan fokus input tiap keystroke.

const SEARCH_MIN_LENGTH = 2 // selaras MIN_QUERY_LENGTH backend
const SEARCH_DEBOUNCE_MS = 300

interface SearchResult {
  type: "event" | "sponsor_deal"
  id: string
  eventId: string
  label: string
  sublabel: string
}

function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  // Query yang hasilnya sedang ditampilkan — pembeda "belum dicari" vs "sudah
  // dicari tapi kosong" (untuk state "Tidak ditemukan").
  const [searchedFor, setSearchedFor] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  const trimmed = query.trim()

  // Debounce 300ms + AbortController: request lama dibatalkan saat query berubah
  // atau komponen unmount (pola safe-fetch — tidak ada dependency tak stabil).
  useEffect(() => {
    if (trimmed.length < SEARCH_MIN_LENGTH) {
      setResults([])
      setSearchedFor("")
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const token = localStorage.getItem("token") ?? ""
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setResults(Array.isArray(json.data) ? json.data : [])
        setSearchedFor(trimmed)
        setLoading(false)
      } catch (err) {
        if ((err as Error).name === "AbortError") return // dibatalkan — biarkan
        setResults([])
        setSearchedFor(trimmed)
        setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed])

  // Klik di luar kotak pencarian → tutup dropdown (pola combobox standar;
  // belum ada util click-outside di codebase, jadi listener dipasang lokal).
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [])

  const handlePick = (r: SearchResult) => {
    setOpen(false)
    setQuery("")
    setResults([])
    setSearchedFor("")
    // ?eventId= = deep-link resmi yang diadopsi EventProvider (URL menang),
    // sehingga event hasil pencarian jadi event aktif seluruh dashboard.
    if (r.type === "sponsor_deal") {
      router.push(`/dashboard/kerjasama?eventId=${r.eventId}`)
    } else {
      router.push(`/dashboard?eventId=${r.eventId}`)
    }
  }

  const showDropdown =
    open && trimmed.length >= SEARCH_MIN_LENGTH && (loading || searchedFor === trimmed)

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
      <Input
        type="search"
        placeholder="Cari dokumen, event, atau klien..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false)
        }}
        className="h-10 border-slate-200 bg-white pl-9 text-sm placeholder:text-slate-500 focus-visible:ring-emerald-800/40"
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              Mencari...
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">
              Tidak ditemukan untuk &ldquo;{searchedFor}&rdquo;
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((r) => (
                <li key={`${r.type}-${r.id}`}>
                  <button
                    type="button"
                    onClick={() => handlePick(r)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                        r.type === "event"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-indigo-50 text-indigo-700"
                      }`}
                    >
                      {r.type === "event" ? (
                        <CalendarDays className="size-4" />
                      ) : (
                        <Handshake className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {r.label}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {r.sublabel}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const router = useRouter()
  const { user, loading, isAdmin } = useUser()

  // Label peran ditampilkan di bawah nama user. Admin diprioritaskan; sisanya dari `role`.
  const roleLabel = isAdmin
    ? "Administrator"
    : user?.role === "promotor"
      ? "Promotor"
      : user?.role === "crew"
        ? "Crew Lapangan"
        : user?.role === "scanner"
          ? "Scanner Tiket"
          : "Pengguna"

  // Inisial avatar dari nama user (maks 2 huruf pertama tiap kata).
  const initials =
    (user?.name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"

  const handleLogout = () => {
    if (confirm("Apakah Anda yakin ingin keluar dari Workspace?")) {
      localStorage.removeItem("token")
      router.push("/")
    }
  }

  return (
    <header className="print:hidden sticky top-0 z-20 flex items-center gap-4 border-b border-slate-200 bg-slate-50/80 px-4 py-3.5 backdrop-blur-md md:px-8">
      {/* Search */}
      <div className="flex flex-1 items-center gap-3">
        <GlobalSearch />
      </div>

      {/* Right Section */}
      {/* Ikon lonceng notifikasi DIHAPUS 2026-07-24 (keputusan founder): murni
          dekoratif — tidak ada sistem notifikasi in-app di backend, titik hijaunya
          hardcoded, menyesatkan user. JANGAN dikembalikan tanpa backend nyata. */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Pintu tunggal ke pusat administrasi event (buat / ubah data terkunci /
            ajukan hapus / riwayat permintaan). "Buat Event Baru" sudah ada di dalam
            halaman Setup Event, jadi tombol hijau ini mengarah ke sana — bukan lagi
            langsung ke /dashboard/create-event (ikon gerigi terpisah dicabut di
            commit setelah cfb5f74 karena tujuannya identik). */}
        <Link href="/dashboard/setup-event">
          <Button className="hidden h-10 gap-2 bg-emerald-800 font-medium text-white hover:bg-emerald-900 sm:inline-flex">
            <Settings2 className="size-4" />
            Setup Event
          </Button>
        </Link>

        {/* User Profile & Logout */}
        <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white py-1.5 pl-1.5 pr-2">
          {loading ? (
            <div className="size-8 animate-pulse rounded-md bg-slate-200" />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-md bg-emerald-100 text-sm font-semibold text-emerald-800">
              {initials}
            </div>
          )}
          <div className="hidden leading-tight md:block pr-2 border-r border-slate-200">
            {loading ? (
              <>
                <div className="h-3.5 w-24 animate-pulse rounded bg-slate-200" />
                <div className="mt-1 h-2.5 w-16 animate-pulse rounded bg-slate-100" />
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-900">{user?.name ?? "Pengguna"}</p>
                <p className="text-[11px] text-slate-500">{roleLabel}</p>
              </>
            )}
          </div>
          
          {/* Tombol Logout */}
          <button 
            onClick={handleLogout} 
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
            title="Keluar / Logout"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </header>
  )
}