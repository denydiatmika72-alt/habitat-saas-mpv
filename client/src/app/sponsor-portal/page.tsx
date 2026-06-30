"use client"

import { useEffect, useState } from "react"
import { ArrowRight, CalendarDays, Check, Loader2, MapPin, ShieldCheck } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  try { return text ? (JSON.parse(text) as Record<string, unknown>) : {} } catch { return {} }
}

// ─── Config ───────────────────────────────────────────────────────────────────
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
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ApiPackage = {
  id: string
  name: string
  price: number
  slots: number
  description: string
  benefits: Array<{ qty: number; benefit: { id: string; name: string; category: string; price: number } }>
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

type SponsorSubmission = {
  company: string
  contactName: string
  email: string
  tier: string
  packageId?: string
  selectedBenefits: { benefitId: string; qty: number; unitPrice: number }[]
  totalValue: number
}

type Step = "gate" | "form" | "success"

const STEPS: { id: Step; label: string }[] = [
  { id: "gate", label: "Verifikasi" },
  { id: "form", label: "Pendaftaran" },
  { id: "success", label: "Konfirmasi" },
]

// ─── CodeGate ─────────────────────────────────────────────────────────────────
function CodeGate({ onUnlock }: { onUnlock: (code: string, eventId: string | null) => void }) {
  const [code, setCode] = useState("")
  const [status, setStatus] = useState<"idle" | "checking" | "invalid" | "error">("idle")

  const complete = code.trim().length > 0

  async function submit() {
    if (!complete || status === "checking") return
    setStatus("checking")
    try {
      const res = await fetch("/api/sponsor/codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      })
      if (!res.ok) {
        setStatus(res.status === 400 ? "invalid" : "error")
        return
      }
      const data = await safeJson(res)
      if (!data.success) { setStatus("invalid"); return }
      const eventId = (data.data as Record<string, unknown>)?.eventId as string | null ?? null
      onUnlock(code.trim().toUpperCase(), eventId)
    } catch {
      setStatus("error")
    }
  }

  function handleChange(val: string) {
    setCode(val.toUpperCase())
    if (status !== "idle") setStatus("idle")
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") submit()
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
            Portal pendaftaran sponsor ini bersifat privat. Masukkan kode undangan resmi Anda dalam format{" "}
            <span className="font-mono font-medium text-slate-700">SPN-XXXX-XXXX</span>.
          </p>
        </div>

        <input
          type="text"
          value={code}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={status === "checking"}
          placeholder="Contoh: SPN-ABCD-1234"
          className={cn(
            "h-14 w-full rounded-md border bg-slate-50 px-4 text-center font-mono text-xl font-medium text-slate-900 tracking-widest outline-none transition-all duration-300",
            "placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-400",
            status === "idle" && "border-slate-200 focus:border-emerald-800 focus:bg-white focus:shadow-[0_0_0_1px_theme(colors.emerald.800),0_0_24px_-6px_theme(colors.emerald.800/30%)]",
            (status === "invalid" || status === "error") && "border-red-400 text-red-600",
            status === "checking" && "cursor-not-allowed opacity-50",
          )}
        />

        <div className="mt-4 flex min-h-5 items-center justify-center">
          {status === "invalid" && (
            <p className="text-center text-sm text-red-600" role="alert">
              Kode tidak valid atau sudah digunakan.
            </p>
          )}
          {status === "error" && (
            <p className="text-center text-sm text-red-600" role="alert">
              Terjadi kesalahan, coba lagi.
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
  packages = [],
  benefits = [],
}: {
  onSubmit: (data: SponsorSubmission) => Promise<void>
  packages?: ApiPackage[]
  benefits?: ApiBenefit[]
}) {
  const [activeTab, setActiveTab] = useState<"packages" | "alacarte">("packages")
  const [selectedPackageId, setSelectedPackageId] = useState<string>("")
  const [alaCarteQtys, setAlaCarteQtys] = useState<Record<string, number>>({})
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

  const alacarteTotalQty = Object.values(alaCarteQtys).reduce((s, q) => s + q, 0)
  const selectionValid =
    activeTab === "packages" ? selectedPackageId !== "" : alacarteTotalQty > 0
  const valid =
    form.company.trim() && form.contactName.trim() && /.+@.+\..+/.test(form.email) && form.agree && selectionValid

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function setQty(benefitId: string, qty: number) {
    const b = benefits.find((x) => x.id === benefitId)
    if (!b) return
    const available = (b.maxQty || 1) - (b.usedQty || 0) - (b.heldQty || 0)
    setAlaCarteQtys((prev) => ({ ...prev, [benefitId]: Math.min(Math.max(0, qty), available) }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true)

    const selectedPkg = packages.find((p) => p.id === selectedPackageId)
    const tierName =
      activeTab === "packages"
        ? (selectedPkg?.name ?? "")
        : "À La Carte"

    let selectedBenefits: SponsorSubmission["selectedBenefits"] = []
    let totalValue = 0

    if (activeTab === "packages" && selectedPkg) {
      selectedBenefits = selectedPkg.benefits.map(({ benefit, qty }) => ({
        benefitId: benefit.id,
        qty,
        unitPrice: Number(benefit.price),
      }))
      totalValue = Number(selectedPkg.price)
    } else if (activeTab === "alacarte") {
      selectedBenefits = Object.entries(alaCarteQtys)
        .filter(([, qty]) => qty > 0)
        .map(([benefitId, qty]) => {
          const b = benefits.find((x) => x.id === benefitId)!
          return { benefitId, qty, unitPrice: Number(b.price) }
        })
      totalValue = selectedBenefits.reduce((sum, { qty, unitPrice }) => sum + qty * unitPrice, 0)
    }

    setTimeout(async () => {
      try {
        await onSubmit({
          company: form.company.trim(),
          contactName: form.contactName.trim(),
          email: form.email.trim(),
          tier: tierName,
          packageId: activeTab === "packages" ? selectedPackageId : undefined,
          selectedBenefits,
          totalValue,
        })
      } catch {
        setSubmitting(false)
      }
    }, 1100)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-lg sm:p-10">

        {/* ── Section 01: Package selection ──────────────────────────────── */}
        <section>
          <SectionTitle index="01" title="Pilih Paket Sponsorship" hint="Pilih satu" />

          {/* Tab switcher */}
          <div className="mt-5 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("packages")}
              className={cn(
                "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                activeTab === "packages"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              Paket Sponsorship
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("alacarte")}
              className={cn(
                "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
                activeTab === "alacarte"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              Benefit À La Carte
            </button>
          </div>

          {/* Packages tab */}
          {activeTab === "packages" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {packages.length === 0 ? (
                <p className="col-span-2 py-8 text-center text-sm text-slate-500">
                  Belum ada paket tersedia. Hubungi tim kemitraan kami untuk informasi lebih lanjut.
                </p>
              ) : (
                packages.map((pkg) => {
                  const active = selectedPackageId === pkg.id
                  return (
                    <button
                      type="button"
                      key={pkg.id}
                      onClick={() => setSelectedPackageId(pkg.id)}
                      className={cn(
                        "group relative overflow-hidden rounded-xl border p-5 text-left transition-all duration-300",
                        active
                          ? "border-emerald-800/70 bg-emerald-50 shadow-[0_0_0_1px_theme(colors.emerald.800),0_18px_50px_-24px_theme(colors.emerald.800/20%)]"
                          : "border-slate-200 bg-slate-50 hover:border-emerald-800/40 hover:bg-white",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-lg font-medium text-slate-900">{pkg.name}</h3>
                          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-800/80">
                            {pkg.slots} slot tersedia
                          </p>
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
                      <p className="mt-3 font-mono text-xl font-semibold text-emerald-800">
                        {currencyIDR.format(Number(pkg.price))}
                      </p>
                      {pkg.benefits.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {pkg.benefits.map(({ benefit, qty }) => (
                            <li key={benefit.id} className="flex items-center gap-2 text-xs text-slate-600">
                              <span className="size-1 rounded-full bg-emerald-800/70" />
                              <span className="font-medium">{qty}×</span>
                              {benefit.name}
                              <span className="text-slate-400">· {benefit.category}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div
                        className={cn(
                          "mt-3 rounded-lg py-1.5 text-center text-xs font-medium",
                          active ? "bg-emerald-800 text-white" : "bg-emerald-50 text-emerald-800",
                        )}
                      >
                        {active ? "Paket Dipilih" : "Pilih Paket Ini"}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}

          {/* À La Carte tab */}
          {activeTab === "alacarte" && (
            <div className="mt-4 flex flex-col gap-2">
              {benefits.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Belum ada benefit tersedia. Hubungi tim kemitraan kami.
                </p>
              ) : (
                benefits.map((b) => {
                  const available = (b.maxQty || 1) - (b.usedQty || 0) - (b.heldQty || 0)
                  const qty = alaCarteQtys[b.id] ?? 0
                  const outOfStock = available <= 0
                  const selected = qty > 0
                  const subtotal = Number(b.price) * qty

                  return (
                    <div
                      key={b.id}
                      className={cn(
                        "rounded-xl border p-4 transition-colors",
                        outOfStock
                          ? "border-slate-200 bg-slate-50 opacity-60"
                          : selected
                          ? "border-emerald-800/50 bg-emerald-50"
                          : "border-slate-200 bg-slate-50 hover:border-emerald-800/30 hover:bg-white",
                      )}
                    >
                      {/* Header: kategori + badge stok habis */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{b.category}</span>
                        {outOfStock && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
                            Stok Habis
                          </span>
                        )}
                      </div>

                      {/* Nama benefit */}
                      <p className="mt-1 text-sm font-medium text-slate-900">{b.name}</p>

                      {/* Harga satuan dan sisa stok */}
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <span className="text-slate-500">{currencyIDR.format(Number(b.price))} / pcs</span>
                        {!outOfStock && (
                          <span className="font-medium text-emerald-700">Sisa {available} pcs</span>
                        )}
                      </div>

                      {/* Stepper dan subtotal */}
                      {!outOfStock && (
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Qty:</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={qty <= 0}
                                onClick={() => setQty(b.id, qty - 1)}
                                className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:border-emerald-800/40 disabled:opacity-30"
                              >
                                −
                              </button>
                              <span className="w-8 text-center text-sm font-semibold text-slate-900">{qty}</span>
                              <button
                                type="button"
                                disabled={qty >= available}
                                onClick={() => setQty(b.id, qty + 1)}
                                className="flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:border-emerald-800/40 disabled:opacity-30"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          {selected && (
                            <span className="font-mono text-sm font-semibold text-emerald-800">
                              = {currencyIDR.format(subtotal)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}

              {/* Keranjang belanja */}
              {alacarteTotalQty > 0 && (
                <div className="mt-2 rounded-xl border border-emerald-800/20 bg-emerald-50 p-4">
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Keranjang Belanja
                  </p>
                  <div className="flex flex-col gap-2">
                    {Object.entries(alaCarteQtys)
                      .filter(([, q]) => q > 0)
                      .map(([benefitId, q]) => {
                        const b = benefits.find((x) => x.id === benefitId)!
                        return (
                          <div key={benefitId} className="flex items-center justify-between text-sm">
                            <span className="text-slate-700">
                              <span className="font-medium">{q}×</span> {b.name}
                            </span>
                            <span className="font-mono text-emerald-800">
                              {currencyIDR.format(Number(b.price) * q)}
                            </span>
                          </div>
                        )
                      })}
                    <div className="mt-1.5 flex items-center justify-between border-t border-emerald-800/20 pt-2.5">
                      <span className="text-sm font-semibold text-slate-900">Total Investasi</span>
                      <span className="font-mono text-base font-semibold text-emerald-800">
                        {currencyIDR.format(
                          Object.entries(alaCarteQtys)
                            .filter(([, q]) => q > 0)
                            .reduce((sum, [bId, q]) => {
                              const b = benefits.find((x) => x.id === bId)
                              return sum + (b ? Number(b.price) * q : 0)
                            }, 0),
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <div className="my-8 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

        {/* ── Section 02: Company details ─────────────────────────────────── */}
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

        {/* ── Section 03: Contact details ─────────────────────────────────── */}
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

        <button
          type="button"
          onClick={() => { window.location.href = "/sponsor-dashboard" }}
          className="mt-7 inline-flex w-full items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-6 py-3 text-sm font-medium text-slate-900 transition-colors hover:border-emerald-800/40 hover:bg-emerald-50"
        >
          Kembali ke Beranda Acara
        </button>
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
  const [unlockedEventId, setUnlockedEventId] = useState<string | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [packages, setPackages] = useState<ApiPackage[]>([])
  const [benefits, setBenefits] = useState<ApiBenefit[]>([])

  useEffect(() => {
    if (!isVerified) return
    Promise.all([
      fetch("/api/sponsor/packages").then((r) => safeJson(r)),
      fetch("/api/sponsor/benefits").then((r) => safeJson(r)),
    ])
      .then(([pkgData, benData]) => {
        if (pkgData.success && Array.isArray(pkgData.data))
          setPackages(pkgData.data as ApiPackage[])
        if (benData.success && Array.isArray(benData.data))
          setBenefits(benData.data as ApiBenefit[])
      })
      .catch(() => {})
  }, [isVerified])

  async function handleSubmit(data: SponsorSubmission) {
    const res = await fetch("/api/sponsor/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sponsorName: data.company,
        contactName: data.contactName,
        email: data.email,
        tier: data.tier,
        codeUsed: unlockedCode || "PORTAL",
        packageId: data.packageId ?? null,
        selectedBenefits: data.selectedBenefits,
        totalValue: data.totalValue,
        eventId: unlockedEventId,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as { message?: string }).message || "Gagal mengirim data ke server")
    }
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
        {step === "gate" && (
          <CodeGate
            onUnlock={(code, eventId) => {
              setUnlockedCode(code)
              setUnlockedEventId(eventId)
              setIsVerified(true)
              setStep("form")
            }}
          />
        )}
        {step === "form" && (
          <SponsorForm onSubmit={handleSubmit} packages={packages} benefits={benefits} />
        )}
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
