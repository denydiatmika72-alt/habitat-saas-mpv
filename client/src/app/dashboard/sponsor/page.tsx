"use client"

import { useEffect, useMemo, useState } from "react"
import {
  BadgeCheck,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  LayoutGrid,
  Plus,
  RotateCw,
  Sparkles,
  Star,
  Ticket,
  Trash2,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// ─── API ──────────────────────────────────────────────────────────────────────
const API_BASE = "/api"
const getToken = () =>
  typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` })

// ─── Types ────────────────────────────────────────────────────────────────────
type Deal = {
  id: string
  sponsorName: string
  contactName: string
  email: string
  tier: string
  codeUsed: string
  status: string
  createdAt: string
  account: { id: string } | null
}

type GeneratedCreds = {
  dealId: string
  username: string
  password: string
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
}

type ApiPackage = {
  id: string
  name: string
  price: number
  slots: number
  description: string
  benefits: Array<{ benefit: ApiBenefit }>
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

  async function generate() {
    setSpinning(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/sponsor/codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
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

        <div className="mt-8 w-full max-w-md">
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
function DeliverableManagerForDeal({ dealId }: { dealId: string }) {
  const [items, setItems] = useState<ApiDeliverable[]>([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState({ title: "", category: "", status: "Planning" })

  useEffect(() => {
    fetch(`${API_BASE}/sponsor/deliverables?dealId=${dealId}`)
      .then((r) => safeJson(r))
      .then((d) => { if (d.success) setItems((d.data as typeof items) ?? []) })
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
      if (d.success) setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)))
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
      if (d.success) setItems((prev) => prev.map((i) => (i.id === id ? { ...i, proofImageUrl } : i)))
    } catch {}
  }

  return (
    <div className="mt-1 border-t border-slate-100 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Deliverables</p>
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
            <p className="text-xs text-slate-400">Belum ada deliverable ditambahkan.</p>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="flex-1 text-sm text-slate-900">{item.title}</span>
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
                {item.category}
              </span>
              <select
                value={item.status}
                onChange={(e) => updateStatus(item.id, e.target.value)}
                className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 outline-none focus:border-emerald-800"
              >
                <option value="Planning">Planning</option>
                <option value="InProduction">In Production</option>
                <option value="Executed">Executed</option>
              </select>
              {item.status === "Executed" && (
                <input
                  type="text"
                  defaultValue={item.proofImageUrl ?? ""}
                  onBlur={(e) => updateProof(item.id, e.target.value)}
                  placeholder="URL bukti foto"
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-emerald-800"
                />
              )}
            </div>
          ))}

          {adding && (
            <div className="mt-2 flex flex-col gap-2 rounded-lg border border-emerald-800/20 bg-emerald-50 p-3">
              <input
                type="text"
                value={newItem.title}
                onChange={(e) => setNewItem((n) => ({ ...n, title: e.target.value }))}
                placeholder="Nama deliverable"
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-800"
              />
              <input
                type="text"
                value={newItem.category}
                onChange={(e) => setNewItem((n) => ({ ...n, category: e.target.value }))}
                placeholder="Kategori (misal: Branding, Digital)"
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-800"
              />
              <select
                value={newItem.status}
                onChange={(e) => setNewItem((n) => ({ ...n, status: e.target.value }))}
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-emerald-800"
              >
                <option value="Planning">Planning</option>
                <option value="InProduction">In Production</option>
                <option value="Executed">Executed</option>
              </select>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={addDeliverable}
                  className="h-7 gap-1.5 bg-emerald-800 px-2.5 text-xs text-white hover:bg-emerald-900"
                >
                  <Check className="size-3.5" />
                  Simpan
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAdding(false)}
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
function DealCard({
  deal,
  onApprove,
  approving,
  creds,
}: {
  deal: Deal
  onApprove: (d: Deal) => void
  approving: boolean
  creds: GeneratedCreds | null
}) {
  const approved = deal.status === "Disetujui"

  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-white p-5 transition-colors",
        approved ? "border-emerald-800/30" : "border-slate-200",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold",
              approved ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600",
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

            {creds && (
              <div className="mt-3 rounded-xl border border-emerald-800/20 bg-emerald-50 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                  <KeyRound className="size-3.5" />
                  Kredensial klien — bagikan ke sponsor
                </p>
                <p className="font-mono text-xs text-slate-700">
                  Username: <span className="font-semibold">{creds.username}</span>
                </p>
                <p className="font-mono text-xs text-slate-700">
                  Password: <span className="font-semibold">{creds.password}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:pt-0.5">
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
            </>
          ) : (
            <Button
              type="button"
              disabled={approving}
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
          )}
        </div>
      </div>
      {approved && <DeliverableManagerForDeal dealId={deal.id} />}
    </article>
  )
}

// ─── DealTracker ──────────────────────────────────────────────────────────────
function DealTracker() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [creds, setCreds] = useState<GeneratedCreds | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/sponsor/deals`, { headers: authHeaders() })
      .then((r) => safeJson(r))
      .then((data) => { if (data.success) setDeals((data.data as Deal[]) ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
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
      const accountData = await accountRes.json()
      const returnedPassword: string = accountData?.data?.password ?? password

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id ? { ...d, status: "Disetujui", account: { id: "created" } } : d,
        ),
      )
      setCreds({ dealId: deal.id, username, password: returnedPassword })
    } catch {
      // silently ignore — user can retry
    } finally {
      setApproving(null)
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
              approving={approving === deal.id}
              creds={creds?.dealId === deal.id ? creds : null}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ─── BenefitBuilder ───────────────────────────────────────────────────────────
function BenefitBuilder() {
  const [benefits, setBenefits] = useState<ApiBenefit[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: "",
    category: "Branding",
    description: "",
    price: "",
  })

  useEffect(() => {
    fetch(`${API_BASE}/sponsor/benefits`, { headers: authHeaders() })
      .then((r) => safeJson(r))
      .then((d) => { if (d.success) setBenefits((d.data as ApiBenefit[]) ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
        }),
      })
      const d = await safeJson(res)
      if (d.success) {
        setBenefits((prev) => [d.data as ApiBenefit, ...prev])
        setForm({ name: "", category: "Branding", description: "", price: "" })
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
      setBenefits((prev) => prev.filter((b) => b.id !== id))
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
                Deskripsi
              </Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Opsional"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
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
          {benefits.map((b) => (
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
              <p className="text-xs text-slate-500">per sponsor slot</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── PackageBuilder ───────────────────────────────────────────────────────────
function PackageBuilder() {
  const [packages, setPackages] = useState<ApiPackage[]>([])
  const [benefits, setBenefits] = useState<ApiBenefit[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: "",
    slots: "1",
    selectedBenefitIds: [] as string[],
  })

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/sponsor/benefits`, { headers: authHeaders() }).then((r) => safeJson(r)),
      fetch(`${API_BASE}/sponsor/packages`, { headers: authHeaders() }).then((r) => safeJson(r)),
    ])
      .then(([benefitsData, packagesData]) => {
        if (benefitsData.success) setBenefits((benefitsData.data as ApiBenefit[]) ?? [])
        if (packagesData.success) setPackages((packagesData.data as ApiPackage[]) ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const autoPrice = useMemo(() => {
    return benefits
      .filter((b) => form.selectedBenefitIds.includes(b.id))
      .reduce((sum, b) => sum + Number(b.price), 0)
  }, [benefits, form.selectedBenefitIds])

  function toggleBenefit(id: string) {
    setForm((f) => ({
      ...f,
      selectedBenefitIds: f.selectedBenefitIds.includes(id)
        ? f.selectedBenefitIds.filter((x) => x !== id)
        : [...f.selectedBenefitIds, id],
    }))
  }

  async function handleCreate() {
    if (!form.name) return
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/sponsor/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: form.name,
          slots: Number(form.slots),
          price: autoPrice,
          benefitIds: form.selectedBenefitIds,
          description: "",
        }),
      })
      const d = await safeJson(res)
      if (d.success) {
        setPackages((prev) => [d.data as ApiPackage, ...prev])
        setForm({ name: "", slots: "1", selectedBenefitIds: [] })
        setAdding(false)
      }
    } catch {}
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
            Susun paket dari benefit yang sudah dibuat. Harga paket dihitung otomatis dari total benefit yang dipilih.
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
                Nama Paket
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="cth. Platinum Package"
              />
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
              Pilih Benefit yang Termasuk
            </Label>
            {benefits.length === 0 ? (
              <p className="text-sm text-slate-500">
                Belum ada benefit tersedia. Buat benefit dahulu di bagian di atas.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {benefits.map((b) => {
                  const selected = form.selectedBenefitIds.includes(b.id)
                  return (
                    <label
                      key={b.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                        selected
                          ? "border-emerald-800/50 bg-emerald-50"
                          : "border-slate-200 bg-white hover:border-emerald-800/30",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition-all",
                          selected ? "border-emerald-800 bg-emerald-800 text-white" : "border-slate-300",
                        )}
                      >
                        {selected && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selected}
                        onChange={() => toggleBenefit(b.id)}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{b.name}</p>
                        <p className="text-xs text-slate-500">{currencyIDR.format(Number(b.price))}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-800/20 bg-white px-4 py-3">
            <span className="text-sm text-slate-500">Total harga paket (otomatis)</span>
            <span className="font-mono text-xl font-semibold text-emerald-800">
              {currencyIDR.format(autoPrice)}
            </span>
          </div>

          <div className="mt-4 flex gap-3">
            <Button
              type="button"
              disabled={!form.name || saving}
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
              onClick={() => setAdding(false)}
              className="gap-2"
            >
              Batal
            </Button>
          </div>
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
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-slate-900">{pkg.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{pkg.slots} slot tersedia</p>
                  {pkg.benefits.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pkg.benefits.map(({ benefit }) => (
                        <Badge
                          key={benefit.id}
                          variant="outline"
                          className="border-slate-200 text-[0.7rem] text-slate-600"
                        >
                          {benefit.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-2xl font-semibold text-emerald-800">
                    {currencyIDR.format(Number(pkg.price))}
                  </p>
                  <p className="text-xs text-slate-500">total paket</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── ThresholdSettings ────────────────────────────────────────────────────────
function ThresholdSettings() {
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
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="mb-4">
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

      <InvitationCodeGenerator />
      <DealTracker />
      <BenefitBuilder />
      <PackageBuilder />
      <ThresholdSettings />
    </div>
  )
}
