"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Calculator,
  Handshake,
  Users,
  ReceiptText,
  BarChart2,
  Crown,
} from "lucide-react"
import { cn } from "@/lib/utils"

type NavItem =
  | { label: string; icon: React.ElementType; href: string; onClick?: never }
  | { label: string; icon: React.ElementType; onClick: () => void; href?: never }

const nav: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Simulasi Harga Tiket", icon: Calculator, href: "/dashboard/simulasi" },
  { label: "Sponsor & Partner", icon: Handshake, href: "/dashboard/sponsor" },
  { label: "Vendor & Talent", icon: Users, onClick: () => alert("Fitur Vendor Segera Hadir") },
  { label: "Invoice & Penagihan", icon: ReceiptText, onClick: () => alert("Fitur Invoice Segera Hadir") },
  { label: "Laporan P&L", icon: BarChart2, onClick: () => alert("Fitur Laporan Segera Hadir") },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    // Komentar sudah saya pindahkan ke luar JSX agar tidak error
    <aside className="print:hidden hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      {/* Logo / Brand */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
        <div className="flex size-9 items-center justify-center rounded-md bg-emerald-800 text-white">
          <Crown className="size-5" />
        </div>
        <div className="leading-tight">
          <p className="font-heading text-lg font-semibold tracking-tight text-slate-900">
            AURORA
          </p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            Promotor Studio
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          Menu Utama
        </p>
        <ul className="flex flex-col gap-1">
          {nav.map((item) => {
            const isActive = !!item.href && pathname === item.href
            const baseClass = cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-800/30"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )
            return (
              <li key={item.label}>
                {item.href ? (
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={baseClass}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={item.onClick}
                    className={baseClass}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Upgrade Banner */}
      <div className="m-3 rounded-lg border border-emerald-800/20 bg-linear-to-b from-emerald-100 to-transparent p-4">
        <p className="font-heading text-sm font-semibold text-slate-900">
          Paket Eksklusif
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Dokumen tanpa batas, watermark kustom, dan tanda tangan digital.
        </p>
        <Link
          href="/dashboard/upgrade"
          className="mt-3 flex w-full items-center justify-center rounded-md bg-emerald-800 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-900"
        >
          Tingkatkan Paket
        </Link>
      </div>
    </aside>
  )
}