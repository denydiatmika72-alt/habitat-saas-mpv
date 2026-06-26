"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, Search, Plus, LogOut } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function TopBar() {
  const router = useRouter()

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
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <Input
            type="search"
            placeholder="Cari dokumen, event, atau klien..."
            className="h-10 border-slate-200 bg-white pl-9 text-sm placeholder:text-slate-500 focus-visible:ring-emerald-800/40"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2 md:gap-3">
        <Button variant="outline" size="icon" className="relative size-10 border-slate-200 bg-white text-slate-900 hover:bg-slate-100">
          <Bell className="size-4" />
          <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-emerald-800 ring-2 ring-white" />
        </Button>

        <Link href="/dashboard/create-event">
          <Button className="hidden h-10 gap-2 bg-emerald-800 font-medium text-white hover:bg-emerald-900 sm:inline-flex">
            <Plus className="size-4" />
            Buat Event Baru
          </Button>
        </Link>

        {/* User Profile & Logout */}
        <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white py-1.5 pl-1.5 pr-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-emerald-100 text-sm font-semibold text-emerald-800">
            RA
          </div>
          <div className="hidden leading-tight md:block pr-2 border-r border-slate-200">
            <p className="text-sm font-medium text-slate-900">Promotor Aktif</p>
            <p className="text-[11px] text-slate-500">Administrator</p>
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