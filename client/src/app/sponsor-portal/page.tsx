"use client"

import { useEffect, useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react"
import { ArrowRight, CalendarDays, Check, Loader2, MapPin, ShieldCheck } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// ─── Config ───────────────────────────────────────────────────────────────────
const THRESHOLDS_FALLBACK: Record<string, number> = {
  Silver: 0,
  Gold: 0,
  Platinum: 0,
  "Title Sponsor": 0,
  "Community Partner": 0,
}

const currencyIDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

const EVENT = {
  name: "Aurora Music Festival",
  edition: "2025",
  tagline: "The Sound of Tomorrow",
  date: "15–17 Agustus 2025",
  venue: "Gelora Bung Karno, Jakarta",
  codeLength: 6,
}

const SPONSOR_TIERS = [
  {
    id: "platinum",
    name: "Platinum",
    allocation: "2 Slots Available",
    description: "Hak eksklusif penamaan panggung utama, branding LED premium, dan hospitality suite khusus.",
    perks: [
      "Main stage naming rights",
      "Premium LED wall branding",
      "VIP lounge activation",
      "Social media takeover",
      "50 complimentary tickets",
    ],
  },
  {
    id: "gold",
    name: "Gold",
    allocation: "4 Slots Available",
    description: "Visibilitas tinggi di area festival dengan penempatan logo strategis dan aktivasi brand.",
    perks: [
      "Side stage branding",
      "LED screen rotation",
      "Brand activation booth",
      "Social media feature",
      "20 complimentary tickets",
    ],
  },
  {
    id: "silver",
    name: "Silver",
    allocation: "6 Slots Available",
    description: "Kehadiran brand di material promosi resmi dan penempatan banner di area publik.",
    perks: [
      "Banner placement",
      "Program booklet logo",
      "Website listing",
      "10 complimentary tickets",
    ],
  },
  {
    id: "community",
    name: "Community Partner",
    allocation: "Unlimited",
    description: "Dukungan komunitas dengan pengenalan brand pada kanal digital acara.",
    perks: [
      "Website & social listing",
      "Newsletter mention",
      "5 complimentary tickets",
    ],
  },
]

type SponsorSubmission = {
  company: string
  contactName: string
  email: string
  tier: string
}

type Step = "gate" | "form" | "success"

const STEPS: { id: Step; label: string }[] = [
  { id: "gate", label: "Verifikasi" },
  { id: "form", label: "Pendaftaran" },
  { id: "success", label: "Konfirmasi" },
]

// ─── CodeInput ────────────────────────────────────────────────────────────────
function CodeInput({
  length,
  value,
  onChange,
  invalid,
  disabled,
}: {
  length: number
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  disabled?: boolean
}) {
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const [focused, setFocused] = useState<number | null>(null)
  const chars = Array.from({ length }, (_, i) => value[i] ?? "")

  function setCharAt(index: number, char: string) {
    const next = chars.slice()
    next[index] = char
    onChange(next.join("").slice(0, length))
  }

  function handleInput(index: number, raw: string) {
    const char = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-1)
    if (!char) return
    setCharAt(index, char)
    if (index < length - 1) inputs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault()
      if (chars[index]) {
        setCharAt(index, "")
      } else if (index > 0) {
        inputs.current[index - 1]?.focus()
        setCharAt(index - 1, "")
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputs.current[index - 1]?.focus()
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData
      .getData("text")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, length)
    if (!pasted) return
    onChange(pasted)
    const nextIndex = Math.min(pasted.length, length - 1)
    inputs.current[nextIndex]?.focus()
  }

  return (
    <div className="flex items-center justify-center gap-2.5 sm:gap-3" role="group" aria-label="Kode undangan acara">
      {chars.map((char, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el
          }}
          type="text"
          inputMode="text"
          autoComplete="off"
          aria-label={`Karakter ${i + 1}`}
          value={char}
          disabled={disabled}
          maxLength={1}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={() => setFocused(i)}
          onBlur={() => setFocused(null)}
          className={cn(
            "h-14 w-11 rounded-md border bg-slate-50 text-center text-2xl font-medium text-slate-900 caret-emerald-800",
            "shadow-[inset_0_1px_0_oklch(1_0_0/6%)] outline-none transition-all duration-300 sm:h-16 sm:w-13",
            "placeholder:text-slate-400",
            focused === i && !invalid && "border-emerald-800 bg-white shadow-[0_0_0_1px_theme(colors.emerald.800),0_0_24px_-6px_theme(colors.emerald.800/30%)]",
            char && focused !== i && !invalid && "border-emerald-800/40",
            (!char && focused !== i) && "border-slate-200",
            invalid && "border-red-400 text-red-600 shadow-[0_0_0_1px_theme(colors.red.400/40%)]",
            disabled && "cursor-not-allowed opacity-50",
          )}
        />
      ))}
    </div>
  )
}

// ─── CodeGate ─────────────────────────────────────────────────────────────────
function CodeGate({ onUnlock }: { onUnlock: (code: string) => void }) {
  const [code, setCode] = useState("")
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle")

  const complete = code.length === EVENT.codeLength

  async function submit() {
    if (!complete || status === "checking") return
    setStatus("checking")
    try {
      const res = await fetch("/api/sponsor/codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setStatus("error")
        return
      }
      onUnlock(code.toUpperCase())
    } catch {
      setStatus("error")
    }
  }

  function handleChange(next: string) {
    setCode(next)
    if (status === "error") setStatus("idle")
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg sm:p-10">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.35em] text-emerald-800">Akses Undangan</p>
          <h2 className="mt-4 text-balance text-2xl font-medium leading-tight text-slate-900 sm:text-3xl">
            Masukkan Kode Undangan Anda
          </h2>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-slate-500">
            Portal pendaftaran sponsor ini bersifat privat. Gunakan kode {EVENT.codeLength} digit yang tertera pada
            undangan resmi Anda.
          </p>
        </div>

        <CodeInput
          length={EVENT.codeLength}
          value={code}
          onChange={handleChange}
          invalid={status === "error"}
          disabled={status === "checking"}
        />

        <div className="mt-4 flex min-h-5 items-center justify-center">
          {status === "error" && (
            <p className="text-center text-sm text-red-600" role="alert">
              Kode tidak valid atau sudah digunakan.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!complete || status === "checking"}
          className={cn(
            "mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-6 py-3.5 font-medium text-white",
            "shadow-lg shadow-emerald-800/20 transition-all duration-300",
            "hover:bg-emerald-900 hover:shadow-xl hover:shadow-emerald-800/25",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
          )}
        >
          {status === "checking" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Memverifikasi
            </>
          ) : (
            <>
              Lanjutkan Pendaftaran
              <ArrowRight className="size-4" />
            </>
          )}
        </button>

        <div className="mt-6 flex items-center justify-center gap-2 text-slate-500">
          <ShieldCheck className="size-3.5 text-emerald-800/70" />
          <span className="text-xs">Terenkripsi &amp; hanya untuk tamu terpilih</span>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Belum menerima kode?{" "}
        <a href="#" className="text-emerald-700 underline-offset-4 transition-colors hover:text-emerald-800 hover:underline">
          Hubungi tim kemitraan
        </a>
      </p>
    </div>
  )
}

// ─── SponsorForm ──────────────────────────────────────────────────────────────
function SponsorForm({
  onSubmit,
  tierMinPrices = {},
}: {
  onSubmit: (data: SponsorSubmission) => void
  tierMinPrices?: Record<string, number>
}) {
  const [tier, setTier] = useState<string>(SPONSOR_TIERS[1].id)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    company: "",
    contactName: "",
    title: "",
    email: "",
    phone: "",
    notes: "",
    agree: false,
  })

  const valid =
    form.company.trim() && form.contactName.trim() && /.+@.+\..+/.test(form.email) && form.agree && tier

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true)
    setTimeout(() => {
      onSubmit({
        company: form.company.trim(),
        contactName: form.contactName.trim(),
        email: form.email.trim(),
        tier: SPONSOR_TIERS.find((t) => t.id === tier)?.name ?? tier,
      })
    }, 1100)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-lg sm:p-10">
        {/* Tier selection */}
        <section>
          <SectionTitle index="01" title="Pilih Tingkat Kemitraan" hint="Pilih satu" />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {SPONSOR_TIERS.map((t) => {
              const active = tier === t.id
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border p-5 text-left transition-all duration-300",
                    active
                      ? "border-emerald-800/70 bg-emerald-50 shadow-[0_0_0_1px_theme(colors.emerald.800),0_18px_50px_-24px_theme(colors.emerald.800/20%)]"
                      : "border-slate-200 bg-slate-50 hover:border-emerald-800/40 hover:bg-white",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-medium text-slate-900">{t.name}</h3>
                      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-800/80">
                        {t.allocation}
                      </p>
                      {tierMinPrices[t.name] > 0 && (
                        <p className="mt-1 text-xs font-medium text-emerald-800">
                          Mulai dari {currencyIDR.format(tierMinPrices[t.name])}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-all",
                        active ? "border-emerald-800 bg-emerald-800 text-white" : "border-slate-300",
                      )}
                    >
                      {active && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500">{t.description}</p>
                  <ul className="mt-4 space-y-1.5">
                    {t.perks.map((perk) => (
                      <li key={perk} className="flex items-center gap-2 text-xs text-slate-600">
                        <span className="size-1 rounded-full bg-emerald-800/70" />
                        {perk}
                      </li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>
        </section>

        <div className="my-8 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

        {/* Company details */}
        <section>
          <SectionTitle index="02" title="Identitas Perusahaan" />
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Nama Perusahaan" required>
              <Input
                value={form.company}
                onChange={(e) => update("company", e.target.value)}
                placeholder="PT Visionary Global"
              />
            </Field>
            <Field label="Industri / Sektor">
              <Input
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="Finansial, Teknologi, Mewah…"
              />
            </Field>
          </div>
        </section>

        <div className="my-8 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

        {/* Contact details */}
        <section>
          <SectionTitle index="03" title="Narahubung Resmi" />
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Nama Lengkap" required>
              <Input
                value={form.contactName}
                onChange={(e) => update("contactName", e.target.value)}
                placeholder="Nama PIC"
              />
            </Field>
            <Field label="Nomor Telepon">
              <Input
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="+62 …"
              />
            </Field>
            <Field label="Email" required>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="nama@perusahaan.com"
              />
            </Field>
            <Field label="Catatan / Permintaan Khusus">
              <textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Opsional"
                rows={1}
                className="flex min-h-10 w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-slate-400 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </Field>
          </div>
        </section>

        <div className="my-8 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={form.agree}
            onChange={(e) => update("agree", e.target.checked)}
            className="peer sr-only"
          />
          <span
            className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition-all",
              form.agree ? "border-emerald-800 bg-emerald-800 text-white" : "border-slate-300",
            )}
          >
            {form.agree && <Check className="size-3.5" strokeWidth={3} />}
          </span>
          <span className="text-sm leading-relaxed text-slate-500">
            Saya menyatakan bahwa informasi di atas benar dan menyetujui{" "}
            <a href="#" className="text-emerald-700 underline-offset-4 hover:underline">
              syarat kemitraan
            </a>{" "}
            serta kebijakan privasi acara.
          </span>
        </label>

        <button
          type="submit"
          disabled={!valid || submitting}
          className={cn(
            "mt-8 flex w-full items-center justify-center gap-2 rounded-md bg-emerald-800 px-6 py-4 font-medium text-white",
            "shadow-lg shadow-emerald-800/20 transition-all duration-300",
            "hover:bg-emerald-900 hover:shadow-xl hover:shadow-emerald-800/25",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Mengirim Pendaftaran
            </>
          ) : (
            <>
              Kirim Pendaftaran Sponsor
              <ArrowRight className="size-4" />
            </>
          )}
        </button>
      </div>
    </form>
  )
}

function SectionTitle({ index, title, hint }: { index: string; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-xs text-emerald-800/70">{index}</span>
      <h2 className="text-xl font-medium text-slate-900">{title}</h2>
      {hint && <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">{hint}</span>}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
        {label}
        {required && <span className="ml-1 text-emerald-800">*</span>}
      </Label>
      {children}
    </div>
  )
}

// ─── RegistrationSuccess ──────────────────────────────────────────────────────
function RegistrationSuccess({ data }: { data: SponsorSubmission }) {
  const ref = `AUR-${data.company.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X")}-${Math.floor(1000 + Math.random() * 9000)}`

  return (
    <div className="w-full max-w-lg text-center">
      <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-lg">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-emerald-800/40 bg-emerald-800 shadow-lg shadow-emerald-800/20">
          <Check className="size-7 text-white" strokeWidth={2.5} />
        </div>

        <h2 className="mt-7 text-balance text-3xl font-medium leading-tight text-slate-900">
          Pendaftaran Anda Telah Diterima
        </h2>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-slate-500">
          Terima kasih, <span className="text-slate-900">{data.contactName}</span>. Aplikasi kemitraan untuk{" "}
          <span className="text-slate-900">{data.company}</span> sedang ditinjau oleh tim kurasi {EVENT.name}.
        </p>

        <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-left">
          <Row label="Nomor Referensi" value={ref} mono />
          <Row label="Tingkat Kemitraan" value={data.tier} />
          <Row label="Email Konfirmasi" value={data.email} />
        </div>

        <p className="mt-7 text-xs leading-relaxed text-slate-500">
          Konfirmasi resmi beserta dokumen kemitraan akan dikirim ke email Anda dalam 1×24 jam. Mohon simpan nomor
          referensi di atas.
        </p>

        <a
          href="#"
          className="mt-7 inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-6 py-3 text-sm font-medium text-slate-900 transition-colors hover:border-emerald-800/40 hover:bg-emerald-50"
        >
          Kembali ke Beranda Acara
        </a>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-white px-5 py-3.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <span className={`text-sm text-slate-900 ${mono ? "font-mono text-emerald-800" : ""}`}>{value}</span>
    </div>
  )
}

// ─── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="hidden items-center gap-3 md:flex">
      {STEPS.map((s, i) => {
        const done = i < activeIndex
        const active = i === activeIndex
        return (
          <div key={s.id} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-[11px] transition-colors",
                  active && "border-emerald-800 bg-emerald-800 text-white",
                  done && "border-emerald-800/50 text-emerald-800",
                  !active && !done && "border-slate-200 text-slate-500",
                )}
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium uppercase tracking-[0.2em] transition-colors",
                  active ? "text-slate-900" : "text-slate-500",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-slate-200" />}
          </div>
        )
      })}
    </div>
  )
}

// ─── Monogram ─────────────────────────────────────────────────────────────────
function Monogram() {
  return (
    <span className="flex size-11 items-center justify-center rounded-full border border-emerald-800/40 bg-emerald-50 shadow-[inset_0_1px_0_oklch(1_0_0/8%)]">
      <span className="text-xl font-semibold text-emerald-800">A</span>
    </span>
  )
}

// ─── AmbientBackground ───────────────────────────────────────────────────────
function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,oklch(0.78_0.13_160/0.08),transparent_70%)]" />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.5_0.15_160) 1px, transparent 1px), linear-gradient(90deg, oklch(0.5_0.15_160) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SponsorPortalPage() {
  const [step, setStep] = useState<Step>("gate")
  const [submission, setSubmission] = useState<SponsorSubmission | null>(null)
  const [unlockedCode, setUnlockedCode] = useState("")
  const [tierMinPrices, setTierMinPrices] = useState<Record<string, number>>(THRESHOLDS_FALLBACK)

  useEffect(() => {
    fetch("/api/sponsor/thresholds")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && Array.isArray(d.data) && d.data.length > 0) {
          const map: Record<string, number> = { ...THRESHOLDS_FALLBACK }
          d.data.forEach((t: { tierName: string; minPrice: number }) => {
            map[t.tierName] = Number(t.minPrice)
          })
          setTierMinPrices(map)
        }
      })
      .catch(() => {}) // fall back to hardcoded values silently
  }, [])

  async function handleSubmit(data: SponsorSubmission) {
    await fetch("/api/sponsor/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sponsorName: data.company,
        contactName: data.contactName,
        email: data.email,
        tier: data.tier,
        codeUsed: unlockedCode || "PORTAL",
      }),
    }).catch(() => {}) // non-blocking: submission recorded if possible
    setSubmission(data)
    setStep("success")
  }

  const activeIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden bg-slate-50">
      <AmbientBackground />

      {/* Header */}
      <header className="relative z-10 border-b border-slate-200">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <Monogram />
            <div className="leading-tight">
              <p className="text-lg font-medium text-slate-900">{EVENT.name}</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-emerald-800/70">
                Sponsorship · {EVENT.edition}
              </p>
            </div>
          </div>
          <Stepper activeIndex={activeIndex} />
        </div>
      </header>

      {/* Hero copy */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pt-12 text-center sm:pt-16">
        <p className="text-[11px] font-medium uppercase tracking-[0.4em] text-emerald-800/80">
          By Invitation Only · {EVENT.tagline}
        </p>
        <h1 className="mx-auto mt-5 max-w-3xl text-balance text-4xl font-medium leading-[1.05] text-slate-900 sm:text-5xl md:text-6xl">
          Bergabung sebagai <span className="text-emerald-800">Sponsor Terhormat</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-sm leading-relaxed text-slate-500 sm:text-base">
          Pendaftaran mandiri eksklusif bagi mitra terpilih {EVENT.name}. Sebuah malam penghormatan bagi para visioner,
          pemimpin, dan penggerak perubahan.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="size-4 text-emerald-800/70" />
            {EVENT.date}
          </span>
          <span className="hidden h-4 w-px bg-slate-200 sm:block" />
          <span className="inline-flex items-center gap-2">
            <MapPin className="size-4 text-emerald-800/70" />
            {EVENT.venue}
          </span>
        </div>
      </section>

      {/* Active step */}
      <section className="relative z-10 flex flex-1 items-start justify-center px-6 py-14 sm:py-16">
        {step === "gate" && <CodeGate onUnlock={(code) => { setUnlockedCode(code); setStep("form") }} />}
        {step === "form" && <SponsorForm onSubmit={handleSubmit} tierMinPrices={tierMinPrices} />}
        {step === "success" && submission && <RegistrationSuccess data={submission} />}
      </section>

      <footer className="relative z-10 border-t border-slate-200">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-slate-500">
            {`© ${new Date().getFullYear()} ${EVENT.name}. Hak cipta dilindungi.`}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.25em] text-slate-400">
            Confidential · For Selected Partners
          </p>
        </div>
      </footer>
    </main>
  )
}
