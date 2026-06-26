'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, MapPin, Calendar } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { EventCard, type PublicEvent } from '@/components/events/EventCard'

const API_URL = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api`

export default function HomePage() {
  const [events,    setEvents]    = useState<PublicEvent[]>([])
  const [loading,   setLoading]   = useState(true)
  const [searching, setSearching] = useState(false)
  const [searchQ,   setSearchQ]   = useState('')
  const [cityFilter,setCityFilter] = useState('')
  const [dateFilter,setDateFilter] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/events/public`)
      .then(r => r.json())
      .then(d => setEvents(d.data ?? []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearching(true)
    try {
      const params = new URLSearchParams()
      if (searchQ)    params.set('q',    searchQ)
      if (cityFilter) params.set('city', cityFilter)
      if (dateFilter) params.set('date', dateFilter)
      const res = await fetch(`${API_URL}/events/public/search?${params}`)
      const d   = await res.json()
      setEvents(d.data ?? [])
    } catch {
      // keep existing events on error
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-700 px-4 py-20 text-white md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300">
            Platform Musik Terpadu
          </p>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            Temukan Event Musik Favoritmu
          </h1>
          <p className="mt-4 text-lg text-emerald-100">
            Beli tiket langsung dari promotor. Tanpa calo.
          </p>

          <form onSubmit={handleSearch} className="mt-10">
            <div className="flex flex-col gap-3 rounded-2xl bg-white/10 p-4 backdrop-blur-sm md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Cari event, kota, atau tanggal..."
                  className="w-full rounded-xl bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="rounded-xl bg-emerald-500 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-70"
              >
                {searching ? 'Mencari...' : 'Cari Event'}
              </button>
            </div>

            {/* Filter chips */}
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2">
                <MapPin className="size-3.5 shrink-0 text-emerald-300" />
                <input
                  value={cityFilter}
                  onChange={e => setCityFilter(e.target.value)}
                  placeholder="Kota"
                  className="w-24 bg-transparent text-xs text-white placeholder:text-emerald-300 outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2">
                <Calendar className="size-3.5 shrink-0 text-emerald-300" />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="bg-transparent text-xs text-white outline-none [color-scheme:dark]"
                />
              </div>
            </div>
          </form>
        </div>
      </section>

      {/* ── Event Grid ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-8 flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Event Tersedia</h2>
          <span className="text-sm text-slate-500">{events.length} event ditemukan</span>
        </div>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 text-5xl">🎵</div>
            <p className="text-lg font-medium text-slate-700">Belum ada event tersedia.</p>
            <p className="mt-1 text-sm text-slate-500">Pantau terus!</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map(ev => (
              <EventCard key={ev.id} event={ev} />
            ))}
          </div>
        )}
      </section>

      {/* ── Section Promotor ────────────────────────────────────────────────── */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
              Untuk Promotor Musik
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">
              Semua yang Kamu Butuhkan
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: '🎟️',
                title: 'Simulasi Harga Tiket',
                desc: 'Hitung HPP tiket sebelum event dimulai',
              },
              {
                icon: '🤝',
                title: 'Kelola Sponsor dengan Magic Link',
                desc: 'Sponsor pilih benefit sendiri, invoice otomatis',
              },
              {
                icon: '📊',
                title: 'Semua Terhubung Otomatis',
                desc: 'RAB, sponsor, tiket, dan P&L dalam satu dashboard',
              },
            ].map(f => (
              <div
                key={f.title}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-6 transition-shadow hover:shadow-md"
              >
                <div className="mb-4 text-4xl">{f.icon}</div>
                <h3 className="mb-2 font-semibold text-slate-900">{f.title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900"
            >
              Mulai Gratis →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 text-center sm:flex-row sm:justify-between">
          <span className="font-heading text-lg font-bold text-emerald-800">nexEvent</span>
          <p className="text-sm text-slate-500">© 2026 nexEvent</p>
        </div>
      </footer>
    </div>
  )
}
