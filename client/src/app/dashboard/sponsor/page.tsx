"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BadgeCheck,
  Check,
  Copy,
  ExternalLink,
  FileText,
  KeyRound,
  LayoutGrid,
  Lock,
  Mail,
  MessageCircle,
  Plus,
  RotateCw,
  Sparkles,
  Star,
  Ticket,
  Trash2,
  Users,
  X,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useUser } from "@/hooks/useUser"

// ─── API ──────────────────────────────────────────────────────────────────────
const API_BASE = "/api"
const getToken = () =>
  typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` })

// ─── Types ────────────────────────────────────────────────────────────────────
type DealBenefitItem = {
  id: string
  qty: number
  benefit: { name: string; category: string }
}

type Deal = {
  id: string
  sponsorName: string
  contactName: string
  email: string
  tier: string
  codeUsed: string
  status: string
  totalValue: number
  packageId: string | null
  createdAt: string
  account: { id: string } | null
  dealBenefits: DealBenefitItem[]
}

type GeneratedCreds = {
  dealId: string
  username: string
  password: string
  email: string
}

type GeneratedCode = {
  code: string
  createdAt: string
}

type ApiDeliverable = {
  id: string
  title: string
  category: string
  status: string
  proofImageUrl: string | null
  notes: string | null
}

type ApiBenefit = {
  id: string
  name: string
  category: string
  description: string
  price: number
  maxQty: number
  usedQty: number
  heldQty: number
}

type ApiPackage = {
  id: string
  name: string
  price: number
  slots: number
  description: string
  benefits: Array<{ qty: number; benefit: ApiBenefit }>
}

type ApiThreshold = {
  tierName: string
  minPrice: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const currencyIDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

function formatRupiah(val: string): string {
  const digits = val.replace(/[^0-9]/g, "")
  return digits === "" ? "" : Number(digits).toLocaleString("id-ID")
}

function parseRupiah(val: string | number): number {
  if (typeof val === "number") return val
  return Number(String(val).replace(/[^0-9]/g, "")) || 0
}

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  try { return text ? (JSON.parse(text) as Record<string, unknown>) : {} } catch { return {} }
}

const BENEFIT_CATEGORIES = ["Branding", "Digital", "On-Ground", "Ticketing", "Lainnya"]
const DEFAULT_TIERS = ["Silver", "Gold", "Platinum", "Title Sponsor"]

// ─── InvitationCodeGenerator ──────────────────────────────────────────────────
function InvitationCodeGenerator() {
  const [current, setCurrent] = useState<string | null>(null)
  const [history, setHistory] = useState<GeneratedCode[]>([])
  const [copied, setCopied] = useState<string | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<{ id: string; title: string }[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string>("")

  useEffect(() => {
    fetch(`${API_BASE}/events`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.data ?? [])
        setEvents(list)
        if (list.length > 0) setSelectedEventId(String(list[0].id))
      })
      .catch(() => {})
  }, [])

  async function generate() {
    setSpinning(true)
    setError(null)
    const token = getToken()
    console.log('[GENERATE CODE] url:', `${API_BASE}/sponsor/codes`)
    console.log('[GENERATE CODE] token:', token ? `Bearer ${token.slice(0, 20)}...` : 'MISSING — user not logged in?')
    try {
      const res = await fetch(`${API_BASE}/sponsor/codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ eventId: selectedEventId || null }),
      })
      const data = await safeJson(res)
      if (!res.ok || !data.success) {
        const msg = (data.message as string) ?? "Gagal membuat kode undangan."
        console.error("[GENERATE CODE] error:", msg)
        setError(msg)
        return
      }
      const payload = data.data as { code: string; createdAt: string }
      const code: string = payload.code
      console.log("[GENERATE CODE] success:", code)
      setCurrent(code)
      setHistory((prev) =>
        [
          {
            code,
            createdAt: new Date(payload.createdAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
          ...prev,
        ].slice(0, 6),
      )
    } catch (err) {
      const msg = "Tidak dapat terhubung ke server."
      console.error("[GENERATE CODE] exception:", err)
      setError(msg)
    } finally {
      setSpinning(false)
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      window.setTimeout(() => setCopied(null), 1800)
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <section
      aria-labelledby="code-generator-heading"
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 sm:p-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-800/10 blur-3xl"
      />

      <div className="relative flex flex-col items-center text-center">
        <Badge
          variant="outline"
          className="mb-5 gap-1.5 border-emerald-800/30 bg-emerald-50 text-emerald-800"
        >
          <Sparkles className="size-3.5" />
          Invite Sponsors
        </Badge>

        <h2
          id="code-generator-heading"
          className="text-balance text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
        >
          Sponsor Invitation Code Generator
        </h2>
        <p className="mt-3 max-w-md text-pretty leading-relaxed text-slate-500">
          Create a unique, single-use code and share it with brands you want on board for your event.
        </p>

        {events.length > 0 && (
          <div className="mt-6 w-full max-w-md text-left">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pilih Event
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
            >
              {events.map((ev) => (
                <option key={ev.id} value={String(ev.id)}>{ev.title}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-6 w-full max-w-md">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-emerald-800/30 bg-slate-50 px-5 py-5">
            <div className="flex items-center gap-3 overflow-hidden">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                <Ticket className="size-5" />
              </span>
              <span
                className={
                  "truncate font-mono text-xl font-semibold tracking-[0.15em] sm:text-2xl " +
                  (current ? "text-slate-900" : "text-slate-400")
                }
              >
                {current ?? "SPN-••••-••••"}
              </span>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Copy invitation code"
              disabled={!current}
              onClick={() => current && copy(current)}
              className="shrink-0 text-slate-500 hover:text-emerald-800"
            >
              {copied && copied === current ? (
                <Check className="size-5 text-emerald-800" />
              ) : (
                <Copy className="size-5" />
              )}
            </Button>
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          onClick={generate}
          disabled={spinning}
          className="mt-6 h-14 w-full max-w-md gap-2.5 rounded-2xl bg-emerald-800 text-base font-semibold text-white shadow-lg shadow-emerald-800/20 transition-transform hover:bg-emerald-900 active:scale-[0.98]"
        >
          {spinning ? (
            <RotateCw className="size-5 animate-spin" />
          ) : (
            <KeyRound className="size-5" />
          )}
          {current ? "Generate New Code" : "Generate Invitation Code"}
        </Button>

        {error && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={() => window.open("/sponsor-portal", "_blank")}
          className="mt-3 h-12 w-full max-w-md gap-2 rounded-2xl"
        >
          <ExternalLink className="size-4" />
          Buka Sponsor Portal
        </Button>

        {history.length > 0 && (
          <div className="mt-8 w-full max-w-md text-left">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
              Recently generated
            </p>
            <ul className="flex flex-col gap-2">
              {history.map((item) => (
                <li
                  key={item.code}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5"
                >
                  <span className="font-mono text-sm font-medium tracking-wider text-slate-900">
                    {item.code}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{item.createdAt}</span>
                    <button
                      type="button"
                      onClick={() => copy(item.code)}
                      aria-label={`Copy ${item.code}`}
                      className="text-slate-500 transition-colors hover:text-emerald-800"
                    >
                      {copied === item.code ? (
                        <Check className="size-4 text-emerald-800" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

// ─── DeliverableManagerForDeal ────────────────────────────────────────────────
const CATEGORY_BADGE: Record<string, string> = {
  Branding: "bg-blue-50 text-blue-700 ring-blue-200",
  Digital: "bg-purple-50 text-purple-700 ring-purple-200",
  "On-Ground": "bg-amber-50 text-amber-700 ring-amber-200",
  Ticketing: "bg-pink-50 text-pink-700 ring-pink-200",
  Lainnya: "bg-slate-100 text-slate-600 ring-slate-200",
}

function DeliverableManagerForDeal({ dealId }: { dealId: string }) {
  const [items, setItems] = useState<ApiDeliverable[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState({ title: "", category: "", status: "Planning" })
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [proofDrafts, setProofDrafts] = useState<Record<string, string>>({})
  const [proofSaved, setProofSaved] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch(`${API_BASE}/sponsor/deliverables?dealId=${dealId}`)
      .then((r) => safeJson(r))
      .then((d) => {
        if (d.success) {
          const loaded = (d.data as typeof items) ?? []
          setItems(loaded)
          const drafts: Record<string, string> = {}
          loaded.forEach((i) => { drafts[i.id] = i.proofImageUrl ?? "" })
          setProofDrafts(drafts)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingItems(false))
  }, [dealId])

  async function addDeliverable() {
    if (!newItem.title || !newItem.category) return
    try {
      const res = await fetch(`${API_BASE}/sponsor/deliverables`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ dealId, ...newItem }),
      })
      const d = await safeJson(res)
      if (d.success) {
        setItems((prev) => [...prev, d.data as (typeof items)[0]])
        setNewItem({ title: "", category: "", status: "Planning" })
        setAdding(false)
      }
    } catch {}
  }

  async function updateStatus(id: string, status: string) {
    try {
      const res = await fetch(`${API_BASE}/sponsor/deliverables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status }),
      })
      const d = await safeJson(res)
      if (d.success) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)))
        setSavedIds((prev) => new Set([...prev, id]))
        window.setTimeout(() => {
          setSavedIds((prev) => { const s = new Set(prev); s.delete(id); return s })
        }, 1500)
      }
    } catch {}
  }

  async function updateProof(id: string, proofImageUrl: string) {
    try {
      const res = await fetch(`${API_BASE}/sponsor/deliverables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ proofImageUrl }),
      })
      const d = await safeJson(res)
      if (d.success) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, proofImageUrl } : i)))
        setProofSaved((prev) => new Set([...prev, id]))
        window.setTimeout(() => {
          setProofSaved((prev) => { const s = new Set(prev); s.delete(id); return s })
        }, 1500)
      }
    } catch {}
  }

  return (
    <div className="mt-1 border-t border-slate-100 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Deliverables
          {items.length > 0 && (
            <span className="ml-1.5 font-normal text-slate-400">({items.length})</span>
          )}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setAdding((v) => !v)}
          className="h-7 gap-1.5 px-2.5 text-xs"
        >
          <Plus className="size-3.5" />
          Tambah
        </Button>
      </div>

      {loadingItems ? (
        <div className="h-8 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <>
          {items.length === 0 && !adding && (
            <p className="text-xs text-slate-400">
              Deliverables akan muncul otomatis saat deal disetujui.
            </p>
          )}

          {items.map((item) => {
            const badgeCls = CATEGORY_BADGE[item.category] ?? CATEGORY_BADGE["Lainnya"]
            return (
              <div
                key={item.id}
                className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 text-sm font-medium text-slate-900">{item.title}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                      badgeCls,
                    )}
                  >
                    {item.category}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={item.status}
                      onChange={(e) => updateStatus(item.id, e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-emerald-800"
                    >
                      <option value="Planning">📋 Planning</option>
                      <option value="InProduction">⚙️ In Production</option>
                      <option value="Executed">✅ Executed</option>
                    </select>
                    {savedIds.has(item.id) && (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                        <Check className="size-3 text-emerald-700" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                </div>
                {item.status === "Executed" && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={proofDrafts[item.id] ?? ""}
                      onChange={(e) =>
                        setProofDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      placeholder="Paste link Google Drive, Dropbox, atau URL foto"
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-800"
                    />
                    <button
                      type="button"
                      onClick={() => updateProof(item.id, proofDrafts[item.id] ?? "")}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-800 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-900"
                    >
                      {proofSaved.has(item.id) ? (
                        <Check className="size-3" strokeWidth={3} />
                      ) : (
                        "Simpan"
                      )}
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          {adding && (
            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-emerald-800/20 bg-emerald-50 p-3">
              <input
                type="text"
                value={newItem.title}
                onChange={(e) => setNewItem((n) => ({ ...n, title: e.target.value }))}
                placeholder="Nama deliverable"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-800"
              />
              <select
                value={newItem.category}
                onChange={(e) => setNewItem((n) => ({ ...n, category: e.target.value }))}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-emerald-800"
              >
                <option value="">— Pilih kategori —</option>
                {BENEFIT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!newItem.title || !newItem.category}
                  onClick={addDeliverable}
                  className="h-7 gap-1.5 bg-emerald-800 px-2.5 text-xs text-white hover:bg-emerald-900 disabled:opacity-50"
                >
                  <Check className="size-3.5" />
                  Simpan
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAdding(false)
                    setNewItem({ title: "", category: "", status: "Planning" })
                  }}
                  className="h-7 px-2.5 text-xs"
                >
                  Batal
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── DealCard ─────────────────────────────────────────────────────────────────

type PromoterSettings = {
  companyName: string | null
  bankName: string | null
  bankAccount: string | null
  accountHolder: string | null
}

type InvoiceState = {
  id: string
  status: string
  invoiceNumber: string
}

function DealCard({
  deal,
  onApprove,
  onReject,
  approving,
  rejecting,
  onCredsGenerated,
  promotorSettings,
}: {
  deal: Deal
  onApprove: (d: Deal) => void
  onReject: (d: Deal) => void
  approving: boolean
  rejecting: boolean
  onCredsGenerated: (c: GeneratedCreds) => void
  promotorSettings: PromoterSettings | null
}) {
  const approved = deal.status === "Disetujui"
  const rejected = deal.status === "Ditolak"
  const [invoiceState, setInvoiceState] = useState<InvoiceState | null>(null)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [resending, setResending] = useState(false)

  async function handleResendCredential() {
    setResending(true)
    try {
      const res = await fetch(`${API_BASE}/sponsor/deals/${deal.id}/resend-credential`, {
        method: 'POST',
        headers: { ...authHeaders() },
      })
      const data = await safeJson(res)
      if (res.ok && data.success && data.data) {
        const d = data.data as { username: string; password: string }
        onCredsGenerated({ dealId: deal.id, username: d.username, password: d.password, email: deal.email })
      }
    } catch {
      // silently ignore — user can retry
    } finally {
      setResending(false)
    }
  }

  useEffect(() => {
    if (!approved) return
    fetch(`${API_BASE}/invoices/deal/${deal.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setInvoiceState({ id: d.data.id, status: d.data.status, invoiceNumber: d.data.invoiceNumber })
        }
      })
      .catch(() => {})
  }, [approved, deal.id])

  async function generateInvoice() {
    if (!promotorSettings?.bankName || !promotorSettings?.companyName) {
      setInvoiceError("Lengkapi data rekening di halaman Invoice > Pengaturan terlebih dahulu.")
      return
    }
    setInvoiceError(null)
    setGeneratingInvoice(true)
    try {
      const res = await fetch(`${API_BASE}/invoices/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          dealId: deal.id,
          promotorName: promotorSettings.companyName,
          bankName: promotorSettings.bankName,
          bankAccount: promotorSettings.bankAccount,
          accountHolder: promotorSettings.accountHolder,
        }),
      })
      const d = await safeJson(res)
      if (d.success && d.data) {
        const data = d.data as Record<string, unknown>
        setInvoiceState({
          id: data.id as string,
          status: "Belum Dibayar",
          invoiceNumber: data.invoiceNumber as string,
        })
      } else {
        setInvoiceError((d.message as string) ?? "Gagal generate invoice.")
      }
    } catch {
      setInvoiceError("Tidak dapat terhubung ke server.")
    } finally {
      setGeneratingInvoice(false)
    }
  }

  async function updateInvoiceStatus(status: string) {
    if (!invoiceState) return
    try {
      const res = await fetch(`${API_BASE}/invoices/${invoiceState.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status }),
      })
      const d = await safeJson(res)
      if (d.success) setInvoiceState((prev) => (prev ? { ...prev, status } : null))
    } catch {}
  }

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-white p-5 transition-colors",
        approved ? "border-emerald-800/30" : rejected ? "border-red-200" : "border-slate-200",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
              approved ? "bg-emerald-50 text-emerald-800" : rejected ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-600",
            )}
          >
            {deal.sponsorName.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">{deal.sponsorName}</p>
              <Badge
                variant="outline"
                className="border-emerald-800/30 bg-emerald-50 text-[0.68rem] text-emerald-800"
              >
                {deal.tier}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-sm text-slate-500">
              {deal.email}
              {deal.contactName ? ` · ${deal.contactName}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Kode: <span className="font-mono">{deal.codeUsed}</span> ·{" "}
              {new Date(deal.createdAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}
            </p>

            {Number(deal.totalValue) > 0 && (
              <p className="mt-1.5 font-mono text-sm font-semibold text-emerald-700">
                {currencyIDR.format(Number(deal.totalValue))}
                <span className="ml-2 font-sans text-[11px] font-normal text-slate-400">
                  {deal.packageId ? "Paket" : "À La Carte"}
                </span>
              </p>
            )}
            {deal.dealBenefits?.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-500">
                📦 {deal.dealBenefits.map((item) => `${item.qty}× ${item.benefit.name}`).join(" · ")}
              </p>
            )}

          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
          {approved ? (
            <>
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-800">
                <BadgeCheck className="size-4" />
                Disetujui
              </span>
              <a
                href="/sponsor-dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-emerald-700 underline-offset-4 hover:text-emerald-800 hover:underline"
              >
                Lihat Dashboard →
              </a>

              {deal.account && (
                <button
                  type="button"
                  onClick={handleResendCredential}
                  disabled={resending}
                  title="Kirim ulang kredensial login ke email sponsor"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  {resending ? <RotateCw className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
                  {resending ? "Mengirim..." : "Kirim Ulang Credential"}
                </button>
              )}

              {!invoiceState && (
                <button
                  type="button"
                  onClick={generateInvoice}
                  disabled={generatingInvoice}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generatingInvoice ? (
                    <RotateCw className="size-3.5 animate-spin" />
                  ) : (
                    <FileText className="size-3.5" />
                  )}
                  {generatingInvoice ? "Membuat..." : "Generate Invoice"}
                </button>
              )}
            </>
          ) : rejected ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-red-600">
              <X className="size-4" />
              Ditolak
            </span>
          ) : (
            <>
              <Button
                type="button"
                disabled={approving || rejecting}
                onClick={() => onApprove(deal)}
                className="gap-2 bg-emerald-800 text-white hover:bg-emerald-900"
              >
                {approving ? (
                  <RotateCw className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Setujui
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={approving || rejecting}
                onClick={() => onReject(deal)}
                className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                {rejecting ? (
                  <RotateCw className="size-4 animate-spin" />
                ) : (
                  <X className="size-4" />
                )}
                Tolak
              </Button>
            </>
          )}
        </div>
      </div>
      {/* Invoice section — row terpisah agar tidak overflow action bar */}
      {approved && invoiceState && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs font-medium text-slate-500">Invoice:</span>
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            <Check className="size-3.5" />
            {invoiceState.invoiceNumber}
          </span>
          <select
            value={invoiceState.status}
            onChange={(e) => updateInvoiceStatus(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-800"
          >
            <option value="Belum Dibayar">Belum Dibayar</option>
            <option value="DP Terbayar">DP Terbayar</option>
            <option value="Lunas">Lunas</option>
          </select>
          {invoiceError && <p className="text-xs text-red-600">{invoiceError}</p>}
        </div>
      )}
      {approved && <DeliverableManagerForDeal dealId={deal.id} />}
    </article>
  )
}

// ─── DealTracker ──────────────────────────────────────────────────────────────
function DealTracker() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [creds, setCreds] = useState<GeneratedCreds | null>(null)
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [promotorSettings, setPromotorSettings] = useState<PromoterSettings | null>(null)

  useEffect(() => {
    function fetchDeals() {
      Promise.all([
        fetch(`${API_BASE}/sponsor/deals`, { headers: authHeaders() }).then(safeJson),
        fetch(`${API_BASE}/settings/promoter`, { headers: authHeaders() }).then(safeJson),
      ])
        .then(([dealsData, settingsData]) => {
          if (dealsData.success) setDeals((dealsData.data as Deal[]) ?? [])
          if (settingsData.success && settingsData.data) setPromotorSettings(settingsData.data as PromoterSettings)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }

    fetchDeals()

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") fetchDeals()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [])

  async function handleApprove(deal: Deal) {
    setApproving(deal.id)
    try {
      const username = deal.email
        .split("@")[0]
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase()
      const password = `SP-${deal.id.slice(0, 6).toUpperCase()}`

      await fetch(`${API_BASE}/sponsor/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status: "Disetujui" }),
      })

      const accountRes = await fetch(`${API_BASE}/sponsor/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          dealId: deal.id,
          sponsorName: deal.sponsorName,
          username,
          password,
          tier: deal.tier,
        }),
      })
      const accountData = await safeJson(accountRes)

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id ? { ...d, status: "Disetujui", account: { id: "created" } } : d,
        ),
      )

      if (accountData.success && accountData.data) {
        const d = accountData.data as { username: string; password: string }
        setEmailSent(false)
        setCreds({ dealId: deal.id, username: d.username, password: d.password, email: deal.email })
      }
    } catch {
      // silently ignore — user can retry
    } finally {
      setApproving(null)
    }
  }

  async function handleReject(deal: Deal) {
    setRejecting(deal.id)
    try {
      await fetch(`${API_BASE}/sponsor/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ status: "Ditolak" }),
      })
      setDeals((prev) =>
        prev.map((d) => d.id === deal.id ? { ...d, status: "Ditolak" } : d),
      )
    } catch {
      // silently ignore
    } finally {
      setRejecting(null)
    }
  }

  return (
    <section aria-labelledby="deal-tracker-heading" className="mt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge
            variant="outline"
            className="mb-3 gap-1.5 border-emerald-800/30 bg-emerald-50 text-emerald-800"
          >
            <Users className="size-3.5" />
            Deal Tracker
          </Badge>
          <h2
            id="deal-tracker-heading"
            className="text-balance text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            Aplikasi Sponsor Masuk
          </h2>
          <p className="mt-2 max-w-xl text-pretty leading-relaxed text-slate-500">
            Sponsor yang mendaftar via portal akan muncul di sini. Setujui untuk membuat akun klien dan membagikan kredensial login.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
          <Users className="mb-3 size-8 text-slate-300" />
          <p className="font-medium text-slate-500">Belum ada aplikasi sponsor masuk.</p>
          <p className="mt-1 text-sm text-slate-400">
            Bagikan kode undangan kepada calon sponsor untuk mulai.
          </p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onApprove={handleApprove}
              onReject={handleReject}
              approving={approving === deal.id}
              rejecting={rejecting === deal.id}
              onCredsGenerated={(c) => { setEmailSent(false); setCreds(c) }}
              promotorSettings={promotorSettings}
            />
          ))}
        </div>
      )}

      {/* ── Credential Modal ── */}
      {creds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100 p-2">
                <KeyRound className="size-5 text-emerald-700" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">Kredensial Sponsor Siap!</h2>
                <p className="text-sm text-slate-500">Simpan atau kirim ke sponsor sekarang</p>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                Akses Login Sponsor
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Email</span>
                  <span className="font-mono text-sm font-semibold text-slate-900">{creds.email || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Username</span>
                  <span className="font-mono text-sm font-semibold text-slate-900">{creds.username}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Password</span>
                  <span className="font-mono text-sm font-bold text-emerald-800">{creds.password}</span>
                </div>
                <div className="border-t border-slate-200 pt-2">
                  <span className="text-xs text-slate-400">Login: nexeventapp.tech/login?role=sponsor</span>
                </div>
              </div>
            </div>

            <div className="mb-3 space-y-2">
              <button
                type="button"
                onClick={() => {
                  const text = `nexEvent Sponsor Login\nEmail: ${creds.email}\nUsername: ${creds.username}\nPassword: ${creds.password}\nLogin: https://nexeventapp.tech/login?role=sponsor`
                  navigator.clipboard.writeText(text)
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <Copy className="size-4" />
                Salin Semua
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Halo! Ini akses Sponsor Dashboard nexEvent Anda 🎉\n\n📧 Email: ${creds.email}\n👤 Username: ${creds.username}\n🔑 Password: ${creds.password}\n\n🔗 Login: https://nexeventapp.tech/login?role=sponsor`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-2.5 text-sm font-bold text-white hover:bg-green-600"
              >
                <MessageCircle className="size-4" />
                Kirim via WhatsApp
              </a>
              <button
                type="button"
                disabled={emailSending || emailSent}
                onClick={async () => {
                  setEmailSending(true)
                  try {
                    const res = await fetch(`${API_BASE}/sponsor/deals/${creds.dealId}/resend-credential`, {
                      method: 'POST',
                      headers: authHeaders(),
                    })
                    const data = await res.json()
                    if (data.success) {
                      setEmailSent(true)
                      // Sync modal dengan password baru yang di-generate saat kirim email
                      if (data.data?.password) {
                        setCreds(c => c ? { ...c, password: data.data.password } : c)
                      }
                    } else alert('Gagal kirim email: ' + (data.message ?? 'Server error'))
                  } catch {
                    alert('Gagal menghubungi server.')
                  } finally {
                    setEmailSending(false)
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {emailSending ? (
                  <RotateCw className="size-4 animate-spin" />
                ) : emailSent ? (
                  <Check className="size-4" />
                ) : (
                  <Mail className="size-4" />
                )}
                {emailSending ? 'Mengirim...' : emailSent ? 'Email Terkirim ke Promotor' : 'Kirim Email ke Sponsor'}
              </button>
            </div>

            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              Simpan password ini sekarang — tidak bisa dilihat lagi setelah modal ditutup. Gunakan tombol "Kirim Ulang Credential" jika sponsor lupa password.
            </p>

            <button
              type="button"
              onClick={() => setCreds(null)}
              className="w-full rounded-xl bg-emerald-800 py-2.5 font-semibold text-white hover:bg-emerald-900"
            >
              Sudah Disimpan, Tutup
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// ─── BenefitBuilder ───────────────────────────────────────────────────────────
function BenefitBuilder({
  benefits,
  loading,
  onBenefitChange,
}: {
  benefits: ApiBenefit[]
  loading: boolean
  onBenefitChange: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: "",
    category: "Branding",
    description: "",
    price: "",
    maxQty: "1",
  })

  async function handleAdd() {
    if (!form.name || !form.price) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/sponsor/benefits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          description: form.description,
          price: parseRupiah(form.price),
          maxQty: Number(form.maxQty) || 1,
        }),
      })
      const d = await safeJson(res)
      if (d.success) {
        onBenefitChange()
        setForm({ name: "", category: "Branding", description: "", price: "", maxQty: "1" })
        setAdding(false)
      }
    } catch {}
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`${API_BASE}/sponsor/benefits/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      onBenefitChange()
    } catch {}
  }

  return (
    <section aria-labelledby="benefit-builder-heading" className="mt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge
            variant="outline"
            className="mb-3 gap-1.5 border-emerald-800/30 bg-emerald-50 text-emerald-800"
          >
            <Star className="size-3.5" />
            Benefit
          </Badge>
          <h2
            id="benefit-builder-heading"
            className="text-balance text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            Benefit Tersedia
          </h2>
          <p className="mt-2 max-w-xl text-pretty leading-relaxed text-slate-500">
            Tentukan benefit sponsorship yang dapat dimasukkan ke dalam paket.
          </p>
        </div>
        <Button
          type="button"
          variant={adding ? "default" : "outline"}
          onClick={() => setAdding((v) => !v)}
          className={cn("gap-2", adding && "bg-emerald-800 text-white hover:bg-emerald-900")}
        >
          {adding ? <Check className="size-4" /> : <Plus className="size-4" />}
          {adding ? "Tutup Form" : "Tambah Benefit"}
        </Button>
      </div>

      {adding && (
        <div className="mt-6 rounded-2xl border border-emerald-800/20 bg-emerald-50 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Nama Benefit
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="cth. Main Stage LED Branding"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Kategori
              </Label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800/30"
              >
                {BENEFIT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Harga Satuan
              </Label>
              <div className="relative flex items-center">
                <span className="pointer-events-none absolute left-3 text-sm text-slate-500">Rp</span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: formatRupiah(e.target.value) }))}
                  placeholder="0"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Stok Maksimal (pcs)
              </Label>
              <Input
                type="number"
                min={1}
                value={form.maxQty}
                onChange={(e) => setForm((f) => ({ ...f, maxQty: e.target.value }))}
                placeholder="1"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Deskripsi
              </Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Opsional"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={!form.name || !form.price || saving}
              onClick={handleAdd}
              className="gap-2 bg-emerald-800 text-white hover:bg-emerald-900"
            >
              {saving ? (
                <RotateCw className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Simpan Benefit
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdding(false)}
              className="gap-2"
            >
              Batal
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : benefits.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
          <Star className="mb-3 size-8 text-slate-300" />
          <p className="font-medium text-slate-500">Belum ada benefit dibuat.</p>
          <p className="mt-1 text-sm text-slate-400">Klik "Tambah Benefit" untuk memulai.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => {
            const available = (b.maxQty ?? 1) - (b.usedQty ?? 0) - (b.heldQty ?? 0)
            return (
              <article
                key={b.id}
                className="relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <Badge
                    variant="outline"
                    className="border-emerald-800/30 bg-emerald-50 text-[0.7rem] text-emerald-800"
                  >
                    {b.category}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => handleDelete(b.id)}
                    aria-label={`Hapus ${b.name}`}
                    className="shrink-0 text-slate-400 transition-colors hover:text-red-500"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <h3 className="mt-3 text-base font-semibold text-slate-900">{b.name}</h3>
                {b.description && (
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">{b.description}</p>
                )}
                <p className="mt-4 font-mono text-xl font-semibold text-slate-900">
                  {currencyIDR.format(Number(b.price))}
                </p>
                <p className="text-xs text-slate-500">per unit</p>
                <div className="mt-2 flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500">Stok:</span>
                  <span className={cn("font-medium", available > 0 ? "text-emerald-700" : "text-red-600")}>
                    {available}/{b.maxQty ?? 1} tersedia
                  </span>
                  {(b.heldQty ?? 0) > 0 && (
                    <span className="text-amber-600">({b.heldQty} ditahan)</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ─── PackageBuilder ───────────────────────────────────────────────────────────
function PackageBuilder({ benefits, thresholds }: { benefits: ApiBenefit[]; thresholds: ApiThreshold[] }) {
  const [packages, setPackages] = useState<ApiPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedTierName, setSelectedTierName] = useState("")
  const [form, setForm] = useState({
    slots: "1",
    benefitQtys: {} as Record<string, number>,
  })

  async function handleDeletePackage(id: string) {
    try {
      await fetch(`${API_BASE}/sponsor/packages/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      setPackages((prev) => prev.filter((p) => p.id !== id))
    } catch {}
  }

  useEffect(() => {
    fetch(`${API_BASE}/sponsor/packages`, { headers: authHeaders() })
      .then((r) => safeJson(r))
      .then((d) => { if (d.success) setPackages((d.data as ApiPackage[]) ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function setQty(benefitId: string, qty: number) {
    const benefit = benefits.find((b) => b.id === benefitId)
    const maxAllowed = benefit?.maxQty ?? 1
    setForm((f) => ({
      ...f,
      benefitQtys: { ...f.benefitQtys, [benefitId]: Math.min(Math.max(0, qty), maxAllowed) },
    }))
  }

  const selectedThreshold = thresholds.find((t) => t.tierName === selectedTierName)
  const packagePrice = selectedThreshold ? Number(selectedThreshold.minPrice) : 0

  async function handleCreate() {
    if (!selectedTierName) return
    const selectedBenefits = Object.entries(form.benefitQtys)
      .filter(([, qty]) => qty > 0)
      .map(([benefitId, qty]) => ({ benefitId, qty }))
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${API_BASE}/sponsor/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: selectedTierName,
          slots: Number(form.slots),
          price: packagePrice,
          benefits: selectedBenefits,
          description: "",
        }),
      })
      const d = await safeJson(res)
      if (d.success) {
        setPackages((prev) => [d.data as ApiPackage, ...prev])
        setSelectedTierName("")
        setForm({ slots: "1", benefitQtys: {} })
        setSaveError(null)
        setAdding(false)
      } else {
        setSaveError((d.message as string) ?? "Gagal menyimpan paket.")
      }
    } catch { setSaveError("Tidak dapat terhubung ke server.") }
    finally { setSaving(false) }
  }

  return (
    <section aria-labelledby="package-builder-heading" className="mt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge
            variant="outline"
            className="mb-3 gap-1.5 border-emerald-800/30 bg-emerald-50 text-emerald-800"
          >
            <LayoutGrid className="size-3.5" />
            Storefront
          </Badge>
          <h2
            id="package-builder-heading"
            className="text-balance text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            Paket Sponsorship
          </h2>
          <p className="mt-2 max-w-xl text-pretty leading-relaxed text-slate-500">
            Susun paket dari benefit yang sudah dibuat. Harga dihitung otomatis dari qty × harga satuan.
          </p>
        </div>
        <Button
          type="button"
          variant={adding ? "default" : "outline"}
          onClick={() => setAdding((v) => !v)}
          className={cn("gap-2", adding && "bg-emerald-800 text-white hover:bg-emerald-900")}
        >
          {adding ? <Check className="size-4" /> : <Plus className="size-4" />}
          {adding ? "Tutup Form" : "Buat Paket Baru"}
        </Button>
      </div>

      {adding && (
        <div className="mt-6 rounded-2xl border border-emerald-800/20 bg-emerald-50 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Pilih Tier
              </Label>
              <select
                value={selectedTierName}
                onChange={(e) => setSelectedTierName(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800/30"
              >
                <option value="">— Pilih tier —</option>
                {thresholds.map((t) => (
                  <option key={t.tierName} value={t.tierName}>
                    {t.tierName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Kuota Slot
              </Label>
              <Input
                type="number"
                min={1}
                value={form.slots}
                onChange={(e) => setForm((f) => ({ ...f, slots: e.target.value }))}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <Label className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Benefit & Kuantitas
            </Label>
            {benefits.length === 0 ? (
              <p className="text-sm text-slate-500">
                Belum ada benefit tersedia. Buat benefit dahulu di bagian di atas.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {benefits.map((b) => {
                  const qty = form.benefitQtys[b.id] ?? 0
                  const selected = qty > 0
                  const atMax = qty >= b.maxQty
                  return (
                    <div
                      key={b.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                        selected
                          ? "border-emerald-800/50 bg-emerald-50"
                          : "border-slate-200 bg-white",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{b.name}</p>
                        <p className="text-xs text-slate-500">
                          {currencyIDR.format(Number(b.price))} / unit
                          {selected && (
                            <span className="ml-2 font-medium text-emerald-700">
                              = {currencyIDR.format(Number(b.price) * qty)}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setQty(b.id, qty - 1)}
                          disabled={qty <= 0}
                          className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:border-emerald-800/40 disabled:opacity-30"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={b.maxQty}
                          value={qty}
                          onChange={(e) => setQty(b.id, Number(e.target.value))}
                          className="w-10 rounded-md border border-slate-200 bg-white px-1 py-0.5 text-center text-sm font-semibold text-slate-900 outline-none focus:border-emerald-800"
                        />
                        <button
                          type="button"
                          onClick={() => setQty(b.id, qty + 1)}
                          disabled={atMax}
                          title={atMax ? "Batas maksimal stok benefit ini" : undefined}
                          className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:border-emerald-800/40 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          +
                        </button>
                        <span className="text-[11px] text-slate-400">/ maks {b.maxQty}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-800/20 bg-white px-4 py-3">
            <div>
              <p className="text-sm text-slate-700">Harga Paket</p>
              <p className="text-[11px] text-slate-400">Dari threshold tier — benefit menentukan isi paket</p>
            </div>
            <span className="font-mono text-xl font-semibold text-emerald-800">
              {selectedTierName
                ? currencyIDR.format(packagePrice)
                : <span className="text-base font-normal text-slate-400">— Pilih tier dulu —</span>}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={!selectedTierName || saving}
              onClick={handleCreate}
              className="gap-2 bg-emerald-800 text-white hover:bg-emerald-900"
            >
              {saving ? (
                <RotateCw className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Simpan Paket
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setAdding(false); setSaveError(null) }}
              className="gap-2"
            >
              Batal
            </Button>
          </div>
          {saveError && (
            <p className="mt-2 text-sm text-red-600" role="alert">{saveError}</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="mt-8 flex flex-col gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
          <LayoutGrid className="mb-3 size-8 text-slate-300" />
          <p className="font-medium text-slate-500">Belum ada paket dibuat.</p>
          <p className="mt-1 text-sm text-slate-400">Klik "Buat Paket Baru" untuk memulai.</p>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          {packages.map((pkg) => (
            <article
              key={pkg.id}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-emerald-800/30 bg-emerald-50 text-emerald-800">
                      {pkg.name}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-500">{pkg.slots} slot tersedia</p>
                </div>
                <div className="flex shrink-0 items-start gap-3">
                  <div className="text-right">
                    <p className="font-mono text-2xl font-semibold text-emerald-800">
                      {currencyIDR.format(Number(pkg.price))}
                    </p>
                    <p className="text-xs text-slate-500">total paket</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeletePackage(pkg.id)}
                    aria-label={`Hapus paket ${pkg.name}`}
                    className="mt-0.5 text-slate-400 transition-colors hover:text-red-500"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              {pkg.benefits.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  {pkg.benefits.map(({ benefit, qty }) => (
                    <div key={benefit.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-emerald-800/50" />
                        <span className="text-sm font-medium text-slate-600">{qty}×</span>
                        <span className="text-sm text-slate-700">{benefit.name}</span>
                        <Badge
                          variant="outline"
                          className="border-slate-200 text-[0.65rem] text-slate-500"
                        >
                          {benefit.category}
                        </Badge>
                      </div>
                      <span className="font-mono text-sm text-slate-600">
                        {currencyIDR.format(Number(benefit.price) * qty)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── ThresholdSettings ────────────────────────────────────────────────────────
function ThresholdSettings({ onThresholdChange }: { onThresholdChange: () => void }) {
  const [rows, setRows] = useState<ApiThreshold[]>(
    DEFAULT_TIERS.map((t) => ({ tierName: t, minPrice: 0 })),
  )
  const [packages, setPackages] = useState<ApiPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/sponsor/thresholds`).then((r) => safeJson(r)),
      fetch(`${API_BASE}/sponsor/packages`, { headers: authHeaders() }).then((r) => safeJson(r)),
    ])
      .then(([thrData, pkgData]) => {
        if (thrData.success && Array.isArray(thrData.data) && (thrData.data as ApiThreshold[]).length > 0) {
          const apiMap: Record<string, number> = {}
          ;(thrData.data as ApiThreshold[]).forEach((t) => {
            apiMap[t.tierName] = Number(t.minPrice)
          })
          setRows(DEFAULT_TIERS.map((t) => ({ tierName: t, minPrice: apiMap[t] ?? 0 })))
        }
        if (pkgData.success) setPackages((pkgData.data as ApiPackage[]) ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function updateRow(idx: number, update: Partial<ApiThreshold>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...update } : r)))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/sponsor/thresholds`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          thresholds: rows.map((r) => ({
            tierName: r.tierName,
            minPrice: Number(r.minPrice),
          })),
        }),
      })
      const d = await safeJson(res)
      if (d.success) {
        setSaved(true)
        onThresholdChange()
        window.setTimeout(() => setSaved(false), 2000)
      }
    } catch {}
    finally { setSaving(false) }
  }

  return (
    <section aria-labelledby="threshold-heading" className="mt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge
            variant="outline"
            className="mb-3 gap-1.5 border-emerald-800/30 bg-emerald-50 text-emerald-800"
          >
            <Star className="size-3.5" />
            Tier Threshold
          </Badge>
          <h2
            id="threshold-heading"
            className="text-balance text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
          >
            Batas Harga Tier Sponsorship
          </h2>
          <p className="mt-2 max-w-xl text-pretty leading-relaxed text-slate-500">
            Atur harga minimum per tier. Gunakan "Isi dari Paket" untuk mengisi otomatis dari harga paket.
          </p>
        </div>
        <Button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="gap-2 bg-emerald-800 text-white hover:bg-emerald-900"
        >
          {saving ? (
            <RotateCw className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {saved ? "Tersimpan!" : "Simpan Threshold"}
        </Button>
      </div>

      {loading ? (
        <div className="mt-8 flex flex-col gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className={cn(
                "flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-4",
                idx > 0 && "border-t border-slate-200",
              )}
            >
              <div className="w-full sm:w-44 shrink-0">
                <Input
                  value={row.tierName}
                  onChange={(e) => updateRow(idx, { tierName: e.target.value })}
                  className="font-medium"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Harga Minimum
                </Label>
                <div className="relative flex items-center">
                  <span className="pointer-events-none absolute left-3 text-sm text-slate-500">Rp</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={row.minPrice === 0 ? "" : formatRupiah(String(row.minPrice))}
                    onChange={(e) => updateRow(idx, { minPrice: parseRupiah(e.target.value) })}
                    className="pl-9 font-mono"
                  />
                </div>
              </div>
              <div className="relative shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setActiveDropdown(activeDropdown === idx ? null : idx)
                  }
                  className="gap-2 text-xs"
                >
                  Isi dari Paket
                </Button>
                {activeDropdown === idx && packages.length > 0 && (
                  <div className="absolute right-0 top-full z-10 mt-1 w-60 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    {packages.map((pkg) => (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => {
                          updateRow(idx, { minPrice: Number(pkg.price) })
                          setActiveDropdown(null)
                        }}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="text-slate-900">{pkg.name}</span>
                        <span className="font-mono text-xs text-emerald-800">
                          {currencyIDR.format(Number(pkg.price))}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {activeDropdown === idx && packages.length === 0 && (
                  <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
                    <p className="text-xs text-slate-500">Belum ada paket dibuat.</p>
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-base font-semibold text-slate-900">
                  {currencyIDR.format(Number(row.minPrice))}
                </p>
                <p className="text-xs text-slate-500">minimum</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SponsorManagementPage() {
  const { isPro, loading: userLoading } = useUser()
  const [benefits, setBenefits] = useState<ApiBenefit[]>([])
  const [benefitsLoading, setBenefitsLoading] = useState(true)
  const [thresholds, setThresholds] = useState<ApiThreshold[]>([])

  function fetchBenefits() {
    fetch(`${API_BASE}/sponsor/benefits`, { headers: authHeaders() })
      .then((r) => safeJson(r))
      .then((d) => { if (d.success) setBenefits((d.data as ApiBenefit[]) ?? []) })
      .catch(() => {})
      .finally(() => setBenefitsLoading(false))
  }

  function fetchThresholds() {
    fetch(`${API_BASE}/sponsor/thresholds`)
      .then((r) => safeJson(r))
      .then((d) => { if (d.success) setThresholds((d.data as ApiThreshold[]) ?? []) })
      .catch(() => {})
  }

  useEffect(() => { fetchBenefits(); fetchThresholds() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
      </div>
    )
  }

  if (!isPro) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-800">
            Workspace Promotor
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Manage Event Sponsors
          </h1>
        </div>
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-emerald-50">
            <Lock className="size-7 text-emerald-800" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">🔒 Fitur Pro</p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
              Sponsor &amp; Partner tersedia untuk pengguna Pro. Upgrade ke Pro untuk invite sponsor, kelola deal, dan generate invoice.
            </p>
          </div>
          <Link
            href="/dashboard/upgrade"
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900"
          >
            Upgrade ke Pro →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-800">
            Workspace Promotor
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Manage Event Sponsors
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-slate-500">
            Invite brands with secure codes and design the sponsorship packages they can purchase — all from one premium workspace.
          </p>
        </div>
        {/* Menuju generator invoice sponsor (tab Sponsorship) — lebih relevan dengan alur kerja
            sponsor daripada tombol Data Audiens lama (redundan, sudah ada di Dashboard Ticketing). */}
        <Link
          href="/dashboard/invoice?tab=sponsorship"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "shrink-0 gap-2 border-slate-200 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900",
          )}
        >
          <FileText className="size-4" />
          Kelola Invoice Sponsor
        </Link>
      </div>

      <InvitationCodeGenerator />
      <DealTracker />
      <BenefitBuilder benefits={benefits} loading={benefitsLoading} onBenefitChange={fetchBenefits} />
      <PackageBuilder benefits={benefits} thresholds={thresholds} />
      <ThresholdSettings onThresholdChange={fetchThresholds} />
    </div>
  )
}
