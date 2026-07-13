"use client"

import { useState } from "react"
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
  ChevronDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useUser } from "@/hooks/useUser"

const mobileNavItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Simulasi", icon: Calculator, href: "/dashboard/simulasi" },
  { label: "Sponsor", icon: Handshake, href: "/dashboard/sponsor" },
  { label: "Invoice", icon: ReceiptText, href: "/dashboard/invoice" },
]

type NavGroup = "Perencanaan" | "Kerjasama" | "Operasional" | "Keuangan" | "Tiket & Pencairan"

const GROUP_ORDER: NavGroup[] = ["Perencanaan", "Kerjasama", "Operasional", "Keuangan", "Tiket & Pencairan"]

type NavItem =
  | { label: string; icon: React.ElementType; href: string; badge?: string; adminOnly?: boolean; hidden?: boolean; group?: NavGroup; onClick?: never }
  | { label: string; icon: React.ElementType; onClick: () => void; badge?: string; adminOnly?: boolean; hidden?: boolean; group?: NavGroup; href?: never }

const nav: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Invoice & Purchase Order", icon: ReceiptText, href: "/dashboard/invoice", group: "Kerjasama" },
  { label: "Simulasi Harga Tiket", icon: Calculator, href: "/dashboard/simulasi", badge: "Pro", group: "Perencanaan" },
  { label: "Sponsor & Partner", icon: Handshake, href: "/dashboard/sponsor", badge: "Pro", group: "Kerjasama" },
  { label: "Vendor & Talent", icon: Users, onClick: () => alert("Fitur Vendor Segera Hadir"), hidden: true },
  { label: "Expense Tracker", icon: Wallet, href: "/dashboard/expenses", badge: "Pro", group: "Keuangan" },
  { label: "Field Crew", icon: Users, href: "/dashboard/crew", badge: "Pro", group: "Operasional" },
  { label: "Manajemen Tiket", icon: Ticket, href: "/dashboard/tickets", group: "Tiket & Pencairan" },
  { label: "Pencairan Dana", icon: Banknote, href: "/dashboard/payout", group: "Tiket & Pencairan" },
  { label: "Laporan P&L", icon: BarChart2, href: "/dashboard/pl-report", badge: "Pro", group: "Keuangan" },
  { label: "Laporan Akhir Event", icon: FileCheck, href: "/dashboard/event-summary", badge: "Pro", group: "Keuangan" },
  { label: "Approve User", icon: ShieldCheck, href: "/dashboard/admin", adminOnly: true },
  { label: "Pendapatan Platform", icon: TrendingUp, href: "/dashboard/admin/revenue", adminOnly: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const { isAdmin } = useUser()
  const visibleNav = nav.filter((item) => !item.hidden && (!item.adminOnly || isAdmin))

  // Grouping is purely a rendering concern applied on top of the already-filtered list.
  const firstGroupIndex = visibleNav.findIndex((item) => item.group)
  const topItems = firstGroupIndex === -1 ? visibleNav : visibleNav.slice(0, firstGroupIndex)
  const bottomItems =
    firstGroupIndex === -1 ? [] : visibleNav.slice(firstGroupIndex).filter((item) => !item.group)

  const [expandedGroups, setExpandedGroups] = useState<Record<NavGroup, boolean>>({
    Perencanaan: true,
    Kerjasama: true,
    Operasional: true,
    Keuangan: true,
    "Tiket & Pencairan": true,
  })

  const renderItem = (item: NavItem) => {
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
              <span className="rounded-full bg-emerald-800 px-1.5 py-0.5 text-[9px] font-black leading-none text-white">
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
              <span className="rounded-full bg-emerald-800 px-1.5 py-0.5 text-[9px] font-black leading-none text-white">
                {item.badge}
              </span>
            )}
          </button>
        )}
      </li>
    )
  }

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
          {topItems.map(renderItem)}

          {GROUP_ORDER.map((group) => {
            const groupItems = visibleNav.filter((item) => item.group === group)
            if (groupItems.length === 0) return null
            const isOpen = expandedGroups[group]
            return (
              <li key={group} className="mt-1">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }))
                  }
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 transition-colors hover:text-slate-700"
                >
                  <span className="flex-1 text-left">{group}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform",
                      !isOpen && "-rotate-90",
                    )}
                  />
                </button>
                {isOpen && (
                  <ul className="mt-1 ml-4 flex flex-col gap-1 border-l border-slate-200 pl-2">
                    {groupItems.map(renderItem)}
                  </ul>
                )}
              </li>
            )
          })}

          {bottomItems.map(renderItem)}
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