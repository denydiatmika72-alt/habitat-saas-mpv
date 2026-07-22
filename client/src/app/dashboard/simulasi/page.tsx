"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import axios from "axios"
import {
  Activity, Sparkles, Users, Wallet, Target, Gauge, Ticket, TrendingUp, CheckCircle2, ArrowLeft, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useUser } from "@/hooks/useUser"
import { useSelectedEvent, useEventGuard } from "@/contexts/event-context"
import { ProLockPanel } from "@/components/dashboard/pro-lock"

// ─── Types ────────────────────────────────────────────────────────────────────
type ClassKey = "earlybird" | "presale" | "normal"

interface EventFromAPI {
  id: number | string
  title: string
  venue_capacity?: number | string
  target_profit?: number | string
  target_sponsorship?: number | string
}

interface BudgetFromAPI {
  totalEstimatedCost: number | string
  contingencyFundAmount: number | string
}

// ─── Static Metadata ─────────────────────────────────────────────────────────
const CLASS_META: Record<ClassKey, { label: string; sublabel: string }> = {
  earlybird: { label: "Early Bird",   sublabel: "Tiket Terbatas (Harga Modal)" },
  presale:   { label: "Presale",      sublabel: "Penjualan Gelombang Utama" },
  normal:    { label: "Normal",       sublabel: "Harga Reguler / OTS" },
}

const CLASS_THEME: Record<ClassKey, { ring: string; chip: string; text: string; bar: string }> = {
  earlybird: { ring: "border-sky-200", chip: "bg-sky-50 text-sky-700 border border-sky-200", text: "text-sky-600", bar:  "bg-sky-500" },
  presale: { ring: "border-indigo-200", chip: "bg-indigo-50 text-indigo-700 border border-indigo-200", text: "text-indigo-600", bar:  "bg-indigo-500" },
  normal: { ring: "border-fuchsia-200", chip: "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200", text: "text-fuchsia-600", bar:  "bg-fuchsia-500" },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatRupiah(num: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Math.max(0, num))
}

function formatCompact(num: number) {
  if (num >= 1e9) return `Rp ${(num / 1e9).toFixed(2)} Miliar`
  if (num >= 1e6) return `Rp ${(num / 1e6).toFixed(1)} Juta`
  return formatRupiah(num)
}

const API = "/api"
const getToken = () => typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` })

// ─── Sub-components ───────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>
}

function RupiahInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-600">{label}</label>
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-colors">
        <span className="text-sm text-slate-400">Rp</span>
        <input
          type="text"
          value={value === 0 ? "" : value.toLocaleString("id-ID")}
          onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
          className="h-11 w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-300"
          placeholder="0"
        />
      </div>
    </div>
  )
}

function AllocSlider({ label, colorClass, accentClass, value, onChange }: { label: string; colorClass: string; accentClass: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-2">
        <span className={`font-medium ${colorClass}`}>{label}</span>
        <span className="text-slate-500">{value}%</span>
      </div>
      <input
        type="range" min="0" max="100" step="5" value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer ${accentClass}`}
      />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RevenueStrategyCenter() {
  const router = useRouter()
  const { isProForEvent, loading: userLoading } = useUser()

  const [events, setEvents]           = useState<EventFromAPI[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [loadingBudget, setLoadingBudget] = useState(false)

  // Event dari EventProvider (dipilih di Dashboard KPI). Dropdown "Pilih Event
  // (Sinkron API)" milik halaman ini DIHAPUS 2026-07-20 — redundan dgn pemilih tunggal.
  const { selectedEventId: eventId } = useSelectedEvent()
  const [targetProfit,        setTargetProfit]        = useState(250_000_000)
  const [sponsorInjection,    setSponsorInjection]    = useState(0)
  const [includeSponsorInPrice, setIncludeSponsorInPrice] = useState(false)
  const [totalBudget,         setTotalBudget]         = useState(0)
  const [attendance,          setAttendance]          = useState(70)
  const [earlybirdAlloc,      setEarlybirdAlloc]      = useState(20)
  const [presaleAlloc,        setPresaleAlloc]        = useState(50)
  const [normalAlloc,         setNormalAlloc]         = useState(30)

  // `eventsReady` HANYA true kalau daftar event benar-benar berhasil dimuat —
  // daftar kosong akibat request gagal tidak boleh dianggap "event sudah dihapus".
  const [eventsReady, setEventsReady] = useState(false)

  useEffect(() => {
    axios.get(`${API}/events`, { headers: authHeaders() })
      .then((res) => {
        const data: EventFromAPI[] = Array.isArray(res.data) ? res.data : (res.data.data ?? [])
        setEvents(data)
        setEventsReady(true)
        // TIDAK auto-pilih event pertama lagi — event ditentukan EventProvider.
      })
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false))
  }, [])

  // Halaman ini punya empty state sendiri saat belum ada event terpilih (tanpa
  // emptyHref), tapi event yang sudah DIHAPUS harus melempar user ke Dashboard KPI.
  useEventGuard({ events, ready: eventsReady })

  useEffect(() => {
    if (!eventId) return
    const ev = events.find((e) => String(e.id) === eventId)
    if (ev) {
      setTargetProfit(Number(ev.target_profit    ?? 250_000_000))
      setSponsorInjection(Number(ev.target_sponsorship ?? 0))
    }

    setLoadingBudget(true)
    axios.get(`${API}/budgets/${eventId}`, { headers: authHeaders() })
      .then((res) => {
        const budget: BudgetFromAPI = res.data.data ?? res.data
        // DI SINI KITA MENGGABUNGKAN RAB MURNI + CADANGAN 20%
        const total = Number(budget.totalEstimatedCost ?? 0) + Number(budget.contingencyFundAmount ?? 0)
        setTotalBudget(total)
      })
      .catch(() => setTotalBudget(0))
      .finally(() => setLoadingBudget(false))
  }, [eventId, events])

  const selectedEvent = useMemo(() => events.find((e) => String(e.id) === eventId) ?? null, [events, eventId])
  const capacity = selectedEvent ? Number(selectedEvent.venue_capacity ?? 0) : 0

  const result = useMemo(() => {
    const attendanceRate   = attendance / 100
    const expectedAttendees = Math.floor(capacity * attendanceRate)

    const totalAlloc = earlybirdAlloc + presaleAlloc + normalAlloc || 1
    const seatsEB    = Math.floor(expectedAttendees * (earlybirdAlloc / totalAlloc))
    const seatsPS    = Math.floor(expectedAttendees * (presaleAlloc   / totalAlloc))
    const seatsNM    = Math.floor(expectedAttendees * (normalAlloc    / totalAlloc))
    const actualSeats = seatsEB + seatsPS + seatsNM

    const effectiveSponsorDeduction = includeSponsorInPrice ? sponsorInjection : 0
    // REVENUE NEEDED SUDAH TERMASUK DANA CADANGAN 20% (KARENA totalBudget ADALAH GRAND TOTAL)
    const revenueNeeded = totalBudget + targetProfit - effectiveSponsorDeduction

    let basePrice = 0
    if (actualSeats > 0) {
      const weight = seatsEB + seatsPS * 1.5 + seatsNM * 2.0
      basePrice = weight > 0 ? revenueNeeded / weight : 0
    }

    const priceEB = Math.ceil(basePrice          / 10_000) * 10_000
    const pricePS = Math.ceil((basePrice * 1.5)  / 10_000) * 10_000
    const priceNM = Math.ceil((basePrice * 2.0)  / 10_000) * 10_000

    const revEB = priceEB * seatsEB
    const revPS = pricePS * seatsPS
    const revNM = priceNM * seatsNM

    const ticketRevenue    = revEB + revPS + revNM
    const projectedRevenue = ticketRevenue + sponsorInjection

    const bepRevenue = Math.max(0, totalBudget - effectiveSponsorDeduction)
    const avgPrice   = (priceEB + pricePS + priceNM) / 3
    const bepTickets = avgPrice > 0 ? Math.ceil(bepRevenue / avgPrice) : 0

    return {
      expectedAttendees: actualSeats, projectedRevenue, ticketRevenue, bepRevenue, bep: bepTickets,
      classes: [
        { key: "earlybird" as ClassKey, price: priceEB, seats: seatsEB, revenue: revEB },
        { key: "presale"   as ClassKey, price: pricePS, seats: seatsPS, revenue: revPS },
        { key: "normal"    as ClassKey, price: priceNM, seats: seatsNM, revenue: revNM },
      ],
    }
  }, [capacity, totalBudget, targetProfit, sponsorInjection, includeSponsorInPrice, attendance, earlybirdAlloc, presaleAlloc, normalAlloc])

  const allocTotal = earlybirdAlloc + presaleAlloc + normalAlloc
  const bepPct     = capacity > 0 ? Math.min(100, (result.bep / capacity) * 100) : 0

  // Gating PER-EVENT (dipindah ke atas efek simpan supaya bisa jadi guard-nya).
  // Tool terbuka hanya kalau event yang DIPILIH aktif Pro.
  const unlocked = isProForEvent(eventId)

  // ── Auto-save HASIL simulasi (debounced) ──────────────────────────────────
  // Halaman ini live-calculating tiap slider bergeser (tidak ada tombol "Simpan"),
  // jadi titik simpan paling natural = debounce setelah slider berhenti. Latest-wins
  // upsert di backend → satu baris per event, selalu ditimpa. Ringkasan di Dashboard
  // Perencanaan lalu mencerminkan setelan terbaru tanpa buka halaman ini.
  //
  // Gate ketat supaya tidak menyimpan state SETENGAH JADI:
  //  - butuh eventId + tool unlocked (kalau lock, endpoint 402 saja)
  //  - JANGAN simpan selama event/budget masih loading (totalBudget bisa 0 sementara)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!eventId || !unlocked) return
    if (loadingEvents || loadingBudget) return

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      axios
        .post(
          `${API}/ticket-simulation`,
          {
            eventId,
            targetProfit,
            sponsorInjection,
            includeSponsorInPrice,
            attendance,
            earlybirdAlloc,
            presaleAlloc,
            normalAlloc,
            capacity,
            totalBudget,
            bepTickets: result.bep,
            bepRevenue: result.bepRevenue,
            priceEarlybird: result.classes[0]?.price ?? 0,
            pricePresale: result.classes[1]?.price ?? 0,
            priceNormal: result.classes[2]?.price ?? 0,
            projectedRevenue: result.projectedRevenue,
          },
          { headers: authHeaders() }
        )
        .catch(() => {
          /* simpan diam-diam — kegagalan tidak boleh mengganggu simulasi live */
        })
    }, 800)

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [
    eventId, unlocked, loadingEvents, loadingBudget,
    targetProfit, sponsorInjection, includeSponsorInPrice, attendance,
    earlybirdAlloc, presaleAlloc, normalAlloc, capacity, totalBudget, result,
  ])

  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-4">
          <Button onClick={() => router.back()} variant="outline" size="icon" className="mt-1 shrink-0 rounded-full border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 print:hidden">
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-700">Kalkulator Simulasi</p>
            <h1 className="mt-1 text-pretty text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Revenue Strategy Center</h1>
            <p className="mt-1.5 max-w-2xl text-pretty text-sm leading-relaxed text-slate-500">Simulasi strategi harga tiket berbasis Grand Total RAB (RAB + Cadangan).</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm shrink-0">
          <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
          <Activity className="h-4 w-4" /> Live Simulation Mode
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Dropdown "Pilih Event (Sinkron API)" DIHAPUS 2026-07-20 — event tunggal
            berasal dari EventProvider (dipilih di Dashboard KPI). Kartu ini kini
            hanya MENAMPILKAN event aktif. */}
        <Card className="p-5">
          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">Event Aktif</label>
          {loadingEvents ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Memuat event…</div>
          ) : selectedEvent ? (
            <p className="mt-3 truncate text-base font-semibold text-slate-900">{selectedEvent.title}</p>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Belum ada event dipilih.{" "}
              <Link href="/dashboard" className="font-semibold text-emerald-700 underline">
                Pilih di Dashboard
              </Link>
            </p>
          )}
        </Card>

        <Card className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-sky-50 to-transparent" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Kapasitas Maksimal</span>
              <span className="rounded-lg border border-slate-200 bg-slate-50 p-2"><Users className="h-5 w-5 text-sky-600" /></span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">{capacity.toLocaleString("id-ID")}</span>
              <span className="text-sm text-slate-500">Orang</span>
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden p-5">
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-fuchsia-50 to-transparent" />
          <div className="relative">
            <div className="flex items-center justify-between">
              {/* LABEL DIPERJELAS AGAR PROMOTOR TAHU INI SUDAH TERMASUK CADANGAN */}
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Grand Total (RAB + Cadangan)</span>
              <span className="rounded-lg border border-slate-200 bg-slate-50 p-2"><Wallet className="h-5 w-5 text-fuchsia-600" /></span>
            </div>
            <div className="mt-4">
              {loadingBudget ? (
                <div className="flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Memuat…</span></div>
              ) : (
                <span className="text-2xl font-bold tracking-tight text-slate-900">{formatCompact(totalBudget)}</span>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Tanpa event terpilih, `unlocked` selalu false — tapi menampilkan gembok "upgrade"
          di situ menyesatkan (masalahnya belum pilih event, bukan belum Pro). */}
      {!eventId ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-slate-500">
            Pilih event terlebih dahulu untuk menjalankan simulasi harga tiket.
          </p>
          <Link href="/dashboard" className="mt-2 inline-block text-sm font-semibold text-emerald-700 underline">
            Pilih event di Dashboard
          </Link>
        </Card>
      ) : unlocked ? (
      <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col justify-between p-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="rounded-lg border border-slate-200 bg-slate-50 p-2"><Target className="h-5 w-5 text-indigo-600" /></span>
              <div><h2 className="text-lg font-semibold text-slate-900">Target Keuangan</h2><p className="text-xs text-slate-500">Atur ekspektasi profit &amp; target sponsor.</p></div>
            </div>
            <div className="mt-6 space-y-5">
              <RupiahInput label="Target Keuntungan Bersih (Profit)" value={targetProfit} onChange={setTargetProfit} />
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <label className="flex items-center gap-1.5 text-sm font-medium text-amber-700"><Sparkles className="h-4 w-4" />Target Sponsor / Eksternal</label>
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-3 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-colors">
                  <span className="text-sm text-amber-600">Rp</span>
                  <input type="text" value={sponsorInjection === 0 ? "" : sponsorInjection.toLocaleString("id-ID")} onChange={(e) => setSponsorInjection(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} className="h-11 w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-300" placeholder="0" />
                </div>
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-white p-3">
                  <input type="checkbox" id="sponsorToggle" checked={includeSponsorInPrice} onChange={(e) => setIncludeSponsorInPrice(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-amber-300 accent-amber-500" />
                  <label htmlFor="sponsorToggle" className="cursor-pointer select-none text-xs">
                    <strong className="block text-amber-800 mb-1">Gunakan Sponsor untuk Subsidi Harga Tiket?</strong>
                    {includeSponsorInPrice ? <span className="text-sky-700 leading-relaxed">✅ <strong>MODE AGRESIF:</strong> Dana sponsor dipakai untuk memotong harga tiket agar lebih murah.</span> : <span className="text-amber-700 leading-relaxed">❌ <strong>MODE AMAN:</strong> Harga tiket dihitung murni dari RAB &amp; Profit.</span>}
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-700">Break-Even Point (Balik Modal)</span><span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600 border border-indigo-100">Live Estimasi</span></div>
            <div className="mt-3 flex items-baseline gap-2"><span className="text-2xl font-bold text-slate-900">{result.bep.toLocaleString("id-ID")}</span><span className="text-sm text-slate-500">tiket terjual</span></div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-linear-to-r from-indigo-500 to-fuchsia-500 transition-all duration-300" style={{ width: `${bepPct}%` }} /></div>
            <p className="mt-2 text-xs text-slate-500">Menutup Grand Total RAB {formatCompact(result.bepRevenue)} · {bepPct.toFixed(0)}% dari kapasitas.</p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2.5">
            <span className="rounded-lg border border-slate-200 bg-slate-50 p-2"><Gauge className="h-5 w-5 text-sky-600" /></span>
            <div><h2 className="text-lg font-semibold text-slate-900">Tiering Penjualan Tiket</h2><p className="text-xs text-slate-500">Bebas atur persentase kuota di tiap gelombang.</p></div>
          </div>
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-between mb-4"><span className="text-sm font-medium text-slate-700">Estimasi Kehadiran Penonton</span><span className="text-lg font-bold text-sky-600">{attendance}%</span></div>
            <input type="range" min="0" max="100" step="1" value={attendance} onChange={(e) => setAttendance(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500" />
            <p className="mt-3 text-xs text-slate-500">Proyeksi <span className="font-semibold text-slate-700">{result.expectedAttendees.toLocaleString("id-ID")}</span> orang yang akan membeli tiket.</p>
          </div>
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Persentase Gelombang</span>
              <span className={`text-xs font-medium ${allocTotal === 100 ? "text-emerald-600" : "text-amber-600"}`}>Total {allocTotal}%{allocTotal !== 100 && " (Harus 100%)"}</span>
            </div>
            <AllocSlider label="Early Bird (Harga Modal)" colorClass="text-sky-600" accentClass="accent-sky-500" value={earlybirdAlloc} onChange={setEarlybirdAlloc} />
            <AllocSlider label="Presale (Mayoritas)" colorClass="text-indigo-600" accentClass="accent-indigo-500" value={presaleAlloc} onChange={setPresaleAlloc} />
            <AllocSlider label="Normal / On The Spot" colorClass="text-fuchsia-600" accentClass="accent-fuchsia-500" value={normalAlloc} onChange={setNormalAlloc} />
          </div>
        </Card>
      </div>

      <section className="pt-2">
        <div className="flex flex-col md:flex-row md:items-start gap-4 mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="rounded-lg border border-slate-200 bg-slate-50 p-2 shrink-0 w-fit"><Ticket className="h-5 w-5 text-fuchsia-600" /></span>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Rekomendasi Harga Tiket</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm mt-1.5">
              <p className="text-slate-500">Proyeksi Jual Tiket: <strong className="text-slate-900">{formatCompact(result.ticketRevenue)}</strong></p>
              <p className="text-slate-500">{includeSponsorInPrice ? "Subsidi Sponsor: " : "Bonus Sponsor: "}<strong className={includeSponsorInPrice ? "text-sky-600" : "text-amber-600"}>{formatCompact(sponsorInjection)}</strong></p>
              <p className="text-slate-500">Total Proyeksi Akhir: <strong className="text-emerald-700">{formatCompact(result.projectedRevenue)}</strong></p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {result.classes.map((c) => {
            const theme = CLASS_THEME[c.key]; const meta = CLASS_META[c.key]
            return (
              <div key={c.key} className={`rounded-2xl border ${theme.ring} bg-white shadow-sm overflow-hidden`}>
                <div className="p-6 border-b border-dashed border-slate-200">
                  <div className="flex items-start justify-between">
                    <div><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${theme.chip}`}>{meta.label}</span><p className="mt-2 text-xs text-slate-500">{meta.sublabel}</p></div>
                    <Sparkles className={`h-5 w-5 ${theme.text}`} />
                  </div>
                  <div className="mt-5"><p className="text-xs uppercase tracking-wider text-slate-400">Harga Jual per Tiket</p><p className={`mt-1 text-3xl font-bold tracking-tight ${theme.text}`}>{formatRupiah(c.price)}</p></div>
                </div>
                <div className="p-5 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div><p className="flex items-center gap-1 text-xs text-slate-500"><TrendingUp className="h-3.5 w-3.5" />Total Masuk</p><p className={`mt-1 text-lg font-bold ${theme.text}`}>{formatCompact(c.revenue)}</p></div>
                    <div className="text-right"><p className="text-xs text-slate-500">Kuota Ludes</p><p className="mt-1 text-lg font-bold text-slate-900">{c.seats.toLocaleString("id-ID")}</p></div>
                  </div>
                  {result.expectedAttendees > 0 && (
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className={`h-full rounded-full ${theme.bar} transition-all duration-300`} style={{ width: `${Math.min(100, (c.seats / result.expectedAttendees) * 100)}%` }} />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
      </>
      ) : (
        <ProLockPanel
          eventId={eventId}
          featureName="Simulasi Harga Tiket"
          description="Event ini belum aktif Pro. Simulasi strategi harga tiket khusus Pro — upgrade untuk membuka fitur ini untuk event terpilih."
        />
      )}
    </div>
  )
}