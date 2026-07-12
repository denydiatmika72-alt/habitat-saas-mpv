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
  ShieldCheck,
  Wallet,
  Ticket,
  Banknote,
  TrendingUp,
  FileCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useUser } from "@/hooks/useUser"

const mobileNavItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Simulasi", icon: Calculator, href: "/dashboard/simulasi" },
  { label: "Sponsor", icon: Handshake, href: "/dashboard/sponsor" },
  { label: "Invoice", icon: ReceiptText, href: "/dashboard/invoice" },
]

type NavItem =
  | { label: string; icon: React.ElementType; href: string; badge?: string; adminOnly?: boolean; hidden?: boolean; onClick?: never }
  | { label: string; icon: React.ElementType; onClick: () => void; badge?: string; adminOnly?: boolean; hidden?: boolean; href?: never }

const nav: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Invoice & Purchase Order", icon: ReceiptText, href: "/dashboard/invoice" },
  { label: "Simulasi Harga Tiket", icon: Calculator, href: "/dashboard/simulasi", badge: "Pro" },
  { label: "Sponsor & Partner", icon: Handshake, href: "/dashboard/sponsor", badge: "Pro" },
  { label: "Vendor & Talent", icon: Users, onClick: () => alert("Fitur Vendor Segera Hadir"), hidden: true },
  { label: "Expense Tracker", icon: Wallet, href: "/dashboard/expenses", badge: "Pro" },
  { label: "Field Crew", icon: Users, href: "/dashboard/crew", badge: "Pro" },
  { label: "Manajemen Tiket", icon: Ticket, href: "/dashboard/tickets", badge: "Pro" },
  { label: "Pencairan Dana", icon: Banknote, href: "/dashboard/payout", badge: "Pro" },
  { label: "Laporan P&L", icon: BarChart2, href: "/dashboard/pl-report", badge: "Pro" },
  { label: "Laporan Akhir Event", icon: FileCheck, href: "/dashboard/event-summary", badge: "Pro" },
  { label: "Approve User", icon: ShieldCheck, href: "/dashboard/admin", adminOnly: true },
  { label: "Pendapatan Platform", icon: TrendingUp, href: "/dashboard/admin/revenue", adminOnly: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const { isAdmin } = useUser()
  const visibleNav = nav.filter((item) => !item.hidden && (!item.adminOnly || isAdmin))

  return (
    // Komentar sudah saya pindahkan ke luar JSX agar tidak error
    <aside className="print:hidden hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      {/* Logo / Brand */}
      {/* TODO: replace with actual nexEvent logo asset when founder provides the file */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
        <div className="flex size-9 items-center justify-center rounded-md bg-emerald-800 text-sm font-bold text-white">
          N
        </div>
        <div className="leading-tight">
          <p className="font-heading text-lg font-semibold tracking-tight text-slate-900">
            nexEvent
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          Menu Utama
        </p>
        <ul className="flex flex-col gap-1">
          {visibleNav.map((item) => {
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
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-black leading-none text-neutral-950">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={item.onClick}
                    className={baseClass}
                  >
                    <item.icon className="size-4" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-black leading-none text-neutral-950">
                        {item.badge}
                      </span>
                    )}
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

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="print:hidden fixed bottom-0 inset-x-0 z-[9999] flex h-16 lg:hidden border-t border-slate-200 bg-white shadow-[0_-1px_4px_rgba(0,0,0,0.06)]">
      {mobileNavItems.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
              isActive ? "text-emerald-800" : "text-slate-500 hover:text-slate-700",
            )}
          >
            <item.icon className={cn("size-5", isActive && "stroke-[2.5]")} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}