'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Crown, Search, LayoutDashboard, ShieldCheck } from 'lucide-react'

function decodeJwtEmail(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return decoded.email ?? null
  } catch {
    return null
  }
}

export function Navbar() {
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isAdmin, setIsAdmin]       = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    setIsLoggedIn(true)
    const email = decodeJwtEmail(token)
    const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)
    setIsAdmin(!!email && adminEmails.includes(email))
  }, [])

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-emerald-800 text-white">
            <Crown className="size-4" />
          </div>
          <span className="font-heading font-bold tracking-tight text-slate-900">nexEvent</span>
        </Link>

        {/* Search bar — hidden on small mobile */}
        <div className="relative hidden flex-1 sm:block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Cari event, kota, atau tanggal..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
          />
        </div>

        {/* Auth buttons */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {isLoggedIn ? (
            <>
              {isAdmin && (
                <button
                  onClick={() => router.push('/admin')}
                  className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
                >
                  <ShieldCheck className="size-4" />
                  Admin Panel
                </button>
              )}
              <button
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 rounded-lg bg-emerald-800 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-900"
              >
                <LayoutDashboard className="size-4" />
                Dashboard →
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Login Promotor
              </Link>
              <Link
                href="/login?role=sponsor"
                className="rounded-lg bg-emerald-800 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-900"
              >
                Masuk Sponsor
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
