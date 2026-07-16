"use client"

import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileText,
  ImageOff,
  Loader2,
  MapPin,
  Trophy,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── API ──────────────────────────────────────────────────────────────────────
const API_BASE = "/api"

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  try { return text ? (JSON.parse(text) as Record<string, unknown>) : {} } catch { return {} }
}

const currencyIDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

// ─── Types ────────────────────────────────────────────────────────────────────
type ApiDeliverable = {
  id: string
  title: string
  category: string
  status: string
  proofImageUrl: string | null
  notes: string | null
  createdAt: string
  value: number | null
  dealCreatedAt: string | null
}

type DeliverableStatus = "completed" | "in-progress" | "scheduled" | "at-risk"

type Milestone = {
  label: string
  date: string
  done: boolean
}

type Proof = {
  id: string
  src: string
  caption: string
  date: string
  location: string
}

type Deliverable = {
  id: string
  title: string
  rightType: string
  category: string
  status: DeliverableStatus
  delivered: number
  contracted: number
  unit: string
  progress: number
  value: string
  window: string
  milestones: Milestone[]
  proofs: Proof[]
}

type DashStats = {
  total: number
  executed: number
  active: number
  packagePrice: number
  loaded: boolean
}

// ─── Deliverable mapping helpers ──────────────────────────────────────────────
function mapApiStatus(s: string): DeliverableStatus {
  if (s === "Executed") return "completed"
  if (s === "InProduction") return "in-progress"
  return "scheduled"
}

function computeWindow(dealCreatedAt: string | null): string {
  if (!dealCreatedAt) return "Hari H Event"
  const deadline = new Date(dealCreatedAt)
  deadline.setDate(deadline.getDate() + 30)
  return `s/d ${deadline.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`
}

function computeMilestones(status: DeliverableStatus): Milestone[] {
  const labels = ["Persiapan materi", "Proses produksi", "Eksekusi & dokumentasi"]
  return labels.map((label, i) => {
    let done = false
    if (status === "completed") done = true
    else if (status === "in-progress") done = i < 2
    return { label, date: "", done }
  })
}

function mapToDeliverable(d: ApiDeliverable): Deliverable {
  const status = mapApiStatus(d.status)
  return {
    id: d.id,
    title: d.title,
    rightType: d.category,
    category: d.category,
    status,
    delivered: status === "completed" ? 1 : 0,
    contracted: 1,
    unit: "items",
    progress: status === "completed" ? 100 : status === "in-progress" ? 50 : 0,
    value: d.value != null ? currencyIDR.format(d.value) : "—",
    window: computeWindow(d.dealCreatedAt),
    milestones: computeMilestones(status),
    proofs: d.proofImageUrl
      ? [{ id: "proof", src: d.proofImageUrl, caption: d.notes ?? "", date: "", location: "" }]
      : [],
  }
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────
const statusConfig: Record<
  DeliverableStatus,
  { label: string; dot: string; text: string; ring: string }
> = {
  completed: {
    label: "Completed",
    dot: "bg-emerald-800",
    text: "text-emerald-800",
    ring: "ring-emerald-800/30 bg-emerald-50",
  },
  "in-progress": {
    label: "In Progress",
    dot: "bg-emerald-500",
    text: "text-emerald-600",
    ring: "ring-emerald-500/25 bg-emerald-50",
  },
  scheduled: {
    label: "Scheduled",
    dot: "bg-slate-400",
    text: "text-slate-500",
    ring: "ring-slate-200 bg-slate-50",
  },
  "at-risk": {
    label: "At Risk",
    dot: "bg-red-500",
    text: "text-red-600",
    ring: "ring-red-200 bg-red-50",
  },
}

function StatusBadge({ status }: { status: DeliverableStatus }) {
  const c = statusConfig[status]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        c.ring,
        c.text,
      )}
    >
      <span className={cn("size-1.5 rounded-full", c.dot)} aria-hidden />
      {c.label}
    </span>
  )
}

// ─── SponsorTopbar ────────────────────────────────────────────────────────────
function SponsorTopbar({ clientName, clientTier }: { clientName: string; clientTier: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-3.5 md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-emerald-800/30">
            <span className="text-lg font-bold text-emerald-800">A</span>
          </div>
          <div className="leading-tight">
            <p className="text-base font-semibold tracking-tight text-slate-900">
              Aurora
            </p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Sponsor Rights Portal
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <button
            type="button"
            className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100 sm:inline-flex"
          >
            <Download className="size-4 text-emerald-800" />
            Export report
          </button>
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-900"
          >
            <Bell className="size-4" />
            <span className="absolute right-2 top-2 size-1.5 rounded-full bg-emerald-800" />
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white py-1 pl-1 pr-2.5 transition-colors hover:bg-slate-100"
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-emerald-50 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-800/30">
              {clientName.slice(0, 2).toUpperCase()}
            </span>
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-xs font-medium text-slate-900">
                {clientName}
              </span>
              <span className="block text-[10px] text-slate-500">
                {clientTier}
              </span>
            </span>
            <ChevronDown className="size-3.5 text-slate-500" />
          </button>
        </div>
      </div>
    </header>
  )
}

// ─── RightsOverview ───────────────────────────────────────────────────────────
function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.14em] text-slate-500">
          {label}
        </span>
        <span className="text-emerald-800/80">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-900">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </div>
  )
}

function RightsOverview({
  sponsorName,
  tier,
  stats,
}: {
  sponsorName: string
  tier: string
  stats: DashStats
}) {
  const progress = stats.total > 0 ? Math.round((stats.executed / stats.total) * 100) : 0
  const valueDelivered = stats.total > 0
    ? Math.round((stats.executed / stats.total) * stats.packagePrice)
    : 0

  return (
    <section className="mx-auto max-w-[1400px] px-5 pt-8 md:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
        {/* Hero card */}
        <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 md:p-8">
          <div
            className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-emerald-800/5 blur-3xl"
            aria-hidden
          />
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-emerald-800 ring-1 ring-inset ring-emerald-800/30">
            <Trophy className="size-3.5" />
            {tier}
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 text-balance md:text-4xl">
            {sponsorName}
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            Event Kemitraan · Sponsor {tier}
          </p>

          <div className="mt-7 max-w-md">
            <div className="flex items-end justify-between">
              <span className="text-sm text-slate-500">
                Overall rights fulfilled
              </span>
              <span className="text-2xl font-semibold text-emerald-800">
                {stats.loaded ? `${progress}%` : "—"}
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-800 transition-all duration-700"
                style={{ width: `${stats.loaded ? progress : 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {stats.loaded
                ? stats.total === 0
                  ? "Deliverables belum ditambahkan oleh tim event"
                  : `${stats.executed} dari ${stats.total} deliverable terpenuhi`
                : "Memuat data…"}
            </p>
          </div>
        </div>

        {/* Stat grid */}
        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-2 lg:max-w-md">
          <Stat
            label="Nilai tersampaikan"
            value={stats.loaded ? currencyIDR.format(valueDelivered) : "—"}
            sub={`dari ${stats.loaded ? currencyIDR.format(stats.packagePrice) : "—"} total paket`}
            icon={<CircleDollarSign className="size-4" />}
          />
          <Stat
            label="Tanggal event"
            value="Segera"
            sub="diumumkan"
            icon={<CalendarDays className="size-4" />}
          />
          <Stat
            label="Hak terpenuhi"
            value={stats.loaded ? `${stats.executed}` : "—"}
            sub={stats.loaded
              ? stats.total === 0
                ? "belum ada deliverable"
                : `${stats.total - stats.executed} belum terpenuhi`
              : "memuat…"}
            icon={<Trophy className="size-4" />}
          />
          <Stat
            label="Masih berjalan"
            value={stats.loaded ? `${stats.active}` : "—"}
            sub="deliverable aktif"
            icon={<Trophy className="size-4" />}
          />
        </div>
      </div>
    </section>
  )
}

// ─── DeliverableCard ──────────────────────────────────────────────────────────
function DeliverableCard({
  deliverable: d,
}: {
  deliverable: Deliverable
}) {
  return (
    <article className="flex w-[320px] shrink-0 snap-start flex-col rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-emerald-800/30">
      <div className="flex items-center justify-between">
        <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
          {d.category}
        </span>
        <StatusBadge status={d.status} />
      </div>

      <h3 className="mt-4 text-lg font-semibold leading-snug text-slate-900 text-balance">
        {d.title}
      </h3>
      <p className="text-xs text-slate-500">{d.rightType}</p>

      {/* Progress */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">
            {d.delivered}/{d.contracted} {d.unit}
          </span>
          <span className="font-medium text-emerald-800">{d.progress}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn(
              "h-full rounded-full",
              d.status === "at-risk"
                ? "bg-red-400"
                : "bg-gradient-to-r from-emerald-600 to-emerald-800",
            )}
            style={{ width: `${Math.max(d.progress, 2)}%` }}
          />
        </div>
      </div>

      {/* Meta */}
      <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="leading-tight">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            Value
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {d.value}
          </p>
        </div>
        <div className="text-right leading-tight">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            Window
          </p>
          <p className="text-xs font-medium text-slate-900">{d.window}</p>
        </div>
      </div>

      {/* Milestones */}
      <div className="mt-5">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
          Milestones
        </p>
        {d.milestones.length === 0 ? (
          <p className="text-xs text-slate-400">Belum ada milestone.</p>
        ) : (
          <ol className="relative space-y-3 pl-4">
            <span
              className="absolute left-[5px] top-1 bottom-1 w-px bg-slate-200"
              aria-hidden
            />
            {d.milestones.map((m) => (
              <li key={m.label} className="relative flex items-center gap-2.5">
                <span
                  className={cn(
                    "absolute -left-4 flex size-[11px] items-center justify-center rounded-full ring-2 ring-white",
                    m.done ? "bg-emerald-800" : "bg-slate-200",
                  )}
                >
                  {m.done && (
                    <Check className="size-2 text-white" strokeWidth={3} />
                  )}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    m.done ? "text-slate-900" : "text-slate-500",
                  )}
                >
                  {m.label}
                </span>
                <span className="ml-auto text-[10px] tabular-nums text-slate-500">
                  {m.date}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Proof of execution */}
      <div className="mt-5 border-t border-slate-200 pt-4">
        <div className="mb-2.5 flex items-center gap-1.5">
          <Camera className="size-3.5 text-emerald-800" />
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
            Proof of Execution
          </p>
          <span className="ml-auto text-[10px] text-slate-500">
            {d.proofs.length > 0 ? "1 file tersedia" : "0 files"}
          </span>
        </div>

        {d.proofs.length > 0 ? (
          <a
            href={d.proofs[0].src}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-between rounded-lg border border-emerald-800/30 bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
          >
            <span className="flex items-center gap-2">
              <Camera className="size-4" />
              Lihat Bukti
            </span>
            <span className="text-xs opacity-70">Buka →</span>
          </a>
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-500">
            <ImageOff className="size-5 opacity-60" />
            <span className="text-[11px]">Awaiting first activation</span>
          </div>
        )}
      </div>
    </article>
  )
}

// ─── InvoiceSection ──────────────────────────────────────────────────────────

const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })

type InvoiceSummary = {
  id: string
  invoiceNumber: string
  grandTotal: number
  status: string
  currentTier: string
  createdAt: string
  pdfUrl: string | null
}

function statusInvoiceColor(s: string) {
  if (s === "Lunas") return "text-emerald-700 bg-emerald-50 ring-emerald-200"
  if (s === "DP Terbayar") return "text-amber-700 bg-amber-50 ring-amber-200"
  return "text-red-700 bg-red-50 ring-red-200"
}

function InvoiceSection({ dealId }: { dealId: string }) {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/invoices/deal/${dealId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) setInvoices([d.data])
        else setInvoices([])
      })
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false))
  }, [dealId])

  async function downloadPdf(pdfUrl: string, invoiceNumber: string) {
    setDownloading(invoiceNumber)
    try {
      const res = await fetch(`/api/pdf?path=${encodeURIComponent(pdfUrl)}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${invoiceNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
    setDownloading(null)
  }

  if (loading || invoices.length === 0) return null

  return (
    <section className="mx-auto mt-10 max-w-[1400px] px-5 md:px-8">
      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
          Invoice & Pembayaran
        </h2>
        <p className="mt-1 text-sm text-slate-500">Dokumen tagihan sponsorship Anda</p>
      </div>

      <div className="space-y-3">
        {invoices.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100">
                <FileText className="size-5 text-slate-600" />
              </div>
              <div>
                <p className="font-mono text-sm font-bold text-slate-900">{inv.invoiceNumber}</p>
                <p className="text-xs text-slate-500">
                  {new Date(inv.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                  {" · "}Tier {inv.currentTier}
                </p>
                <p className="mt-0.5 font-mono text-base font-bold text-emerald-700">{IDR.format(Number(inv.grandTotal))}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset", statusInvoiceColor(inv.status))}>
                {inv.status === "Lunas" && <Check className="size-3" strokeWidth={2.5} />}
                {inv.status}
              </span>
              {inv.pdfUrl && (
                <button
                  onClick={() => downloadPdf(inv.pdfUrl!, inv.invoiceNumber)}
                  disabled={downloading === inv.invoiceNumber}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {downloading === inv.invoiceNumber ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  Unduh PDF
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── DeliverablesTracker ──────────────────────────────────────────────────────
function DeliverablesTracker({ dealId }: { dealId: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<Deliverable[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/sponsor/deliverables?dealId=${dealId}`)
      .then((r) => safeJson(r))
      .then((d) => { if (d.success) setItems(((d.data ?? []) as ApiDeliverable[]).map(mapToDeliverable)) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dealId])

  function scrollBy(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ left: dir * 360, behavior: "smooth" })
  }

  return (
    <section className="mx-auto mt-10 max-w-[1400px] px-5 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
            Deliverables Tracker
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Scroll right to review every contracted right and its proof of
            execution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollBy(-1)}
            className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollBy(1)}
            className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="-mx-5 mt-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 md:-mx-8 md:px-8 [scrollbar-width:thin]"
      >
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-72 w-[320px] shrink-0 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </>
        ) : items.length === 0 ? (
          <p className="py-8 text-sm text-slate-400">Belum ada deliverable untuk akun ini.</p>
        ) : (
          items.map((d) => (
            <DeliverableCard key={d.id} deliverable={d} />
          ))
        )}
      </div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SponsorDashboardPage() {
  const [session, setSession] = useState<{ sponsorName: string; tier: string; dealId: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ username: "", password: "" })
  const [stats, setStats] = useState<DashStats>({
    total: 0, executed: 0, active: 0, packagePrice: 0, loaded: false,
  })

  // Baca session dari sessionStorage jika redirect dari /login?role=sponsor
  useEffect(() => {
    const stored = sessionStorage.getItem('sponsor_session')
    if (stored) {
      try { setSession(JSON.parse(stored)) } catch {}
      sessionStorage.removeItem('sponsor_session')
    }
  }, [])

  // Setelah login berhasil, ambil deliverables dan harga paket dari tier
  useEffect(() => {
    if (!session) return
    Promise.all([
      fetch(`${API_BASE}/sponsor/deliverables?dealId=${session.dealId}`).then(safeJson),
      // Harga tier di-scope ke dealId (endpoint publik baru) — menggantikan GET /thresholds global
      // yang kini dikunci ke token promotor (fix keamanan cross-account 2026-07-17).
      fetch(`${API_BASE}/sponsor/public/tier-price?dealId=${session.dealId}`).then(safeJson),
    ])
      .then(([delivData, priceData]) => {
        const delivs = (delivData.data ?? []) as ApiDeliverable[]
        const executed = delivs.filter((d) => d.status === "Executed").length
        const active = delivs.filter((d) => d.status === "InProduction" || d.status === "Planning").length

        const packagePrice = Number((priceData as { tierPrice?: number }).tierPrice ?? 0)

        setStats({ total: delivs.length, executed, active, packagePrice, loaded: true })
      })
      .catch(() => setStats((prev) => ({ ...prev, loaded: true })))
  }, [session])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!form.username || !form.password || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        "/api/sponsor/accounts/verify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: form.username, password: form.password }),
        },
      )
      const data = await safeJson(res)
      if (!res.ok || !data.success) {
        setError((data.message as string) ?? "Login gagal. Periksa username dan password Anda.")
        return
      }
      const d = data.data as { sponsorName: string; tier: string; dealId: string }
      setSession({ sponsorName: d.sponsorName, tier: d.tier, dealId: d.dealId })
    } catch {
      setError("Belum ada akun klien aktif. Hubungi Event Organizer Anda.")
    } finally {
      setLoading(false)
    }
  }

  if (!session) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full border border-emerald-800/30 bg-emerald-50">
                <span className="text-lg font-semibold text-emerald-800">A</span>
              </div>
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-emerald-800">
                Sponsor Rights Portal
              </p>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">
                Masuk ke Dashboard Klien
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Gunakan kredensial yang diberikan oleh Event Organizer Anda.
              </p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Username
                </label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="username"
                  autoComplete="username"
                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800/30"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Password
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800/30"
                />
              </div>

              {error && (
                <p className="text-center text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!form.username || !form.password || loading}
                className="mt-2 flex items-center justify-center gap-2 rounded-md bg-emerald-800 py-3 text-sm font-medium text-white shadow-lg shadow-emerald-800/20 transition-colors hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading && <Loader2 className="size-4 animate-spin" />}
                {loading ? "Memverifikasi…" : "Masuk"}
              </button>
            </form>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-slate-50 pb-16">
      <SponsorTopbar clientName={session.sponsorName} clientTier={session.tier} />
      <RightsOverview sponsorName={session.sponsorName} tier={session.tier} stats={stats} />
      <InvoiceSection dealId={session.dealId} />
      <DeliverablesTracker dealId={session.dealId} />

      <footer className="mx-auto mt-12 max-w-[1400px] px-5 md:px-8">
        <div className="flex flex-col items-start justify-between gap-2 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p>
            Managed by {session.sponsorName} · {session.tier}
          </p>
          <p>Aurora Sponsor Rights Portal · Confidential to {session.sponsorName}</p>
        </div>
      </footer>
    </main>
  )
}
