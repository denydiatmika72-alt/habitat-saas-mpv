"use client"

// ============================================================================
// DeadEventNotice — penjelasan singkat saat user dilempar balik dari event yang
// sudah dihapus (lihat useEventGuard di contexts/event-context.tsx).
// ----------------------------------------------------------------------------
// Dirender di layout /dashboard, DI DALAM <EventProvider>. HARUS di layout —
// bukan di halaman asal — karena halaman asal langsung di-unmount saat redirect;
// kalau pesannya ikut di sana, ia hilang sebelum sempat terbaca.
//
// Proyek ini belum punya library toast (tidak ada sonner/react-hot-toast). Bentuk
// visualnya mengikuti `ToastContainer` yang sudah ada di halaman Invoice (pill
// fixed di kanan-bawah + tombol tutup), TAPI state-nya hidup di EventProvider,
// bukan di halaman — justru supaya selamat melintasi redirect. Warna amber
// (peringatan), bukan merah/hijau seperti toast Invoice yang error/success.
// ============================================================================

import { useEffect } from "react"
import { AlertTriangle, X } from "lucide-react"
import { useSelectedEvent } from "@/contexts/event-context"

/** Pesan menutup diri setelah ini supaya tidak menempel selamanya di dashboard. */
const AUTO_DISMISS_MS = 8000

export function DeadEventNotice() {
  const { deadEventNotice, dismissDeadEventNotice } = useSelectedEvent()

  useEffect(() => {
    if (!deadEventNotice) return
    const t = setTimeout(dismissDeadEventNotice, AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [deadEventNotice, dismissDeadEventNotice])

  if (!deadEventNotice) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 print:hidden">
      <div
        role="status"
        aria-live="polite"
        className="flex max-w-sm items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-lg"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span className="flex-1">{deadEventNotice}</span>
        <button
          onClick={dismissDeadEventNotice}
          className="ml-1 opacity-60 hover:opacity-100"
          aria-label="Tutup pemberitahuan"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
