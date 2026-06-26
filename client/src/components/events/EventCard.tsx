import Link from 'next/link'
import { MapPin, Calendar, Users } from 'lucide-react'

interface TicketType {
  name: string
  price: number
  quota: number
  quota_sold: number
}

export interface PublicEvent {
  id: string
  title: string
  location: string
  event_date: string
  venue_capacity: number
  ticket_types: TicketType[]
}

function formatDate(d: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(d))
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(n)
}

export function EventCard({ event }: { event: PublicEvent }) {
  const totalQuota = event.ticket_types.reduce((a, t) => a + t.quota, 0)
  const quotaSold  = event.ticket_types.reduce((a, t) => a + t.quota_sold, 0)
  const lowestPrice = event.ticket_types.length > 0
    ? Math.min(...event.ticket_types.map(t => Number(t.price)))
    : null

  const isPopular = totalQuota > 0 && quotaSold / totalQuota > 0.5
  const isNew     = event.ticket_types.length > 0 && quotaSold === 0

  return (
    <Link href={`/events/${event.id}`} className="group block">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
        {/* Color banner */}
        <div className="relative h-32 bg-gradient-to-br from-emerald-800 to-emerald-600">
          <div className="absolute left-3 top-3 flex gap-1.5">
            {isPopular && (
              <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-semibold text-white shadow">
                🔥 Populer
              </span>
            )}
            {isNew && !isPopular && (
              <span className="rounded-full bg-blue-500 px-2.5 py-0.5 text-xs font-semibold text-white shadow">
                Baru
              </span>
            )}
          </div>
        </div>

        <div className="p-4">
          <h3 className="line-clamp-2 font-semibold leading-snug text-slate-900 transition-colors group-hover:text-emerald-800">
            {event.title}
          </h3>

          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Calendar className="size-3.5 shrink-0" />
              <span>{formatDate(event.event_date)}</span>
            </div>
            {event.venue_capacity > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Users className="size-3.5 shrink-0" />
                <span>{event.venue_capacity.toLocaleString('id-ID')} kapasitas</span>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3">
            <div>
              {lowestPrice !== null ? (
                <>
                  <p className="text-[10px] text-slate-400">Mulai dari</p>
                  <p className="text-sm font-bold text-emerald-700">{formatCurrency(lowestPrice)}</p>
                </>
              ) : (
                <p className="text-xs text-slate-400">Tiket segera hadir</p>
              )}
            </div>
            {totalQuota > 0 && (
              <div className="text-right">
                <p className="text-[10px] text-slate-400">Terjual</p>
                <p className="text-xs font-semibold text-slate-700">
                  {quotaSold}/{totalQuota}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
