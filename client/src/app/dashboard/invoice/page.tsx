"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { useSelectedEvent } from "@/contexts/event-context"
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  MessageCircle,
  Plus,
  RotateCw,
  Save,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { ProLockPanel } from "@/components/dashboard/pro-lock"

const API_BASE = "/api"
const getToken = () =>
  typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
})

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

const INVOICE_STATUS = ["Belum Dibayar", "DP Terbayar", "Lunas"] as const
type InvoiceStatus = typeof INVOICE_STATUS[number]

// ─── Types ────────────────────────────────────────────────────────────────────

type DealBenefitItem = {
  id: string
  qty: number
  unitPrice: number
  totalPrice: number
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
  dealBenefits: DealBenefitItem[]
}

type PromoterSettings = {
  companyName: string | null
  bankName: string | null
  bankAccount: string | null
  accountHolder: string | null
}

type EventOption = {
  id: string
  title: string
}

type InvoiceItem = {
  name: string
  qty: number
  unitPrice: number
  subtotal: number
}

type InvoiceSummary = {
  id: string
  invoiceNumber: string
  sponsorName: string
  contactName: string
  grandTotal: number
  status: string
  currentTier: string
  createdAt: string
  pdfUrl: string | null
  dealId: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusColor(s: string) {
  if (s === "Lunas") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (s === "DP Terbayar") return "bg-blue-100 text-blue-700 border-blue-200"
  return "bg-amber-100 text-amber-700 border-amber-200"
}

type Toast = { id: number; message: string; type: "success" | "error" }

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm max-w-sm",
            t.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          )}
        >
          {t.type === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <X className="mt-0.5 size-4 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onRemove(t.id)} className="ml-1 opacity-60 hover:opacity-100">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Components ───────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
        <span className="text-slate-500">{icon}</span>
        <h3 className="font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

type PreviewData = {
  invoiceNumber: string
  sponsorName: string
  contactName: string
  sponsorEmail: string
  promotorName: string
  bankName: string
  bankAccount: string
  accountHolder: string
  items: InvoiceItem[]
  grandTotal: number
  bonusItems: string[]
  currentTier: string
  nextTier: string | null
  amountToUpgrade: number | null
  createdAt: string
}

function InvoicePreview({ data, onClose, onDownload, downloading }: {
  data: PreviewData
  onClose: () => void
  onDownload: () => void
  downloading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <span className="font-semibold text-slate-700">Preview Invoice</span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onDownload} disabled={downloading} className="gap-2 bg-slate-900 hover:bg-slate-800">
              {downloading ? <RotateCw className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {downloading ? "Membuat PDF..." : "Unduh PDF"}
            </Button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Invoice body */}
        <div className="p-8 font-sans text-sm">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">INVOICE</h1>
              <p className="mt-1 text-xs text-slate-500">No: {data.invoiceNumber}</p>
              <p className="text-xs text-slate-500">
                Tanggal: {new Date(data.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-900">{data.promotorName}</p>
              <p className="text-xs text-slate-500">Event Organizer</p>
            </div>
          </div>

          <div className="my-5 border-t border-slate-200" />

          {/* Recipient + Bank */}
          <div className="flex justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Ditagihkan Kepada</p>
              <p className="mt-1 font-semibold text-slate-900">{data.sponsorName}</p>
              <p className="text-xs text-slate-500">Perhatian: {data.contactName}</p>
              <p className="text-xs text-slate-500">{data.sponsorEmail}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Transfer Ke</p>
              <p className="mt-1 font-semibold text-slate-900">{data.bankName}</p>
              <p className="text-xs text-slate-500">No. Rek: {data.bankAccount}</p>
              <p className="text-xs text-slate-500">A/N: {data.accountHolder}</p>
            </div>
          </div>

          <div className="my-5 border-t border-slate-200" />

          {/* Tabel benefit */}
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="rounded-tl-lg py-2.5 pl-3 text-left text-xs">#</th>
                <th className="py-2.5 text-left text-xs">Item / Benefit</th>
                <th className="py-2.5 text-right text-xs">Qty</th>
                <th className="py-2.5 text-right text-xs">Harga Satuan</th>
                <th className="rounded-tr-lg py-2.5 pr-3 text-right text-xs">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                  <td className="py-2 pl-3 text-slate-400">{i + 1}</td>
                  <td className="py-2 text-slate-700">{item.name}</td>
                  <td className="py-2 text-right text-slate-700">{item.qty}</td>
                  <td className="py-2 text-right text-slate-700">{IDR.format(item.unitPrice)}</td>
                  <td className="py-2 pr-3 text-right font-medium text-slate-900">{IDR.format(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white">
                <td colSpan={3} className="rounded-bl-lg py-3 pl-3 text-xs font-semibold uppercase tracking-wider">
                  Total Investasi
                </td>
                <td />
                <td className="rounded-br-lg py-3 pr-3 text-right text-base font-bold">{IDR.format(data.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Tier upgrade */}
          {data.nextTier && data.amountToUpgrade != null && data.amountToUpgrade > 0 && (
            <div className="mt-5 rounded-xl border-l-4 border-emerald-500 bg-emerald-50 p-4">
              <p className="font-semibold text-emerald-800">💡 Upgrade Tier</p>
              <p className="mt-1 text-xs text-emerald-700">
                Tambah {IDR.format(data.amountToUpgrade)} lagi untuk naik ke tier{" "}
                <span className="font-bold">{data.nextTier}</span> dan dapatkan lebih banyak benefit!
              </p>
            </div>
          )}

          {/* Bonus items */}
          {data.bonusItems.length > 0 && (
            <div className="mt-4">
              <p className="font-semibold text-violet-700">🎁 Bonus Eksklusif</p>
              <ul className="mt-2 space-y-1">
                {data.bonusItems.map((b, i) => (
                  <li key={i} className="text-xs text-violet-600">• {b}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 border-t border-slate-100 pt-4 text-center text-[10px] text-slate-400">
            Invoice dibuat otomatis oleh sistem nexEvent • {data.promotorName}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InvoicePageWrapper() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">Memuat...</div>}>
      <InvoicePage />
    </Suspense>
  )
}

function InvoicePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  // Event aktif dari EventProvider — invoice STRICTLY per-event sejak 2026-07-20
  // (dulu daftarnya lintas-event; itu bug scoping, bukan desain).
  const { selectedEventId } = useSelectedEvent()
  // Deep-link opsional ke sub-tab tertentu via ?tab= (mis. dari halaman Sponsor & Partner →
  // ?tab=sponsorship). Default tetap "sponsorship" kalau param tidak ada/invalid.
  const tabParam = searchParams.get("tab")
  const initialTab: "sponsorship" | "tenant" | "manual" | "list" | "settings" =
    tabParam === "sponsorship" || tabParam === "tenant" || tabParam === "manual" || tabParam === "list" || tabParam === "settings"
      ? tabParam
      : "sponsorship"
  const [tab, setTab] = useState<"sponsorship" | "tenant" | "manual" | "list" | "settings">(initialTab)

  // Promoter settings
  const [settings, setSettings] = useState<PromoterSettings>({
    companyName: "",
    bankName: "",
    bankAccount: "",
    accountHolder: "",
  })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Deal search
  const [dealSearch, setDealSearch] = useState("")
  const [deals, setDeals] = useState<Deal[]>([])
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)

  // Invoice form
  const [bonusInput, setBonusInput] = useState("")
  const [bonusItems, setBonusItems] = useState<string[]>([])

  // Manual items
  const [manualItems, setManualItems] = useState<InvoiceItem[]>([
    { name: "", qty: 1, unitPrice: 0, subtotal: 0 },
  ])

  // Event picker untuk invoice manual — invoice manual TIDAK lagi menempel ke deal sponsor mana pun,
  // jadi event dipilih eksplisit di sini (menggantikan hack lama deals[0].id).
  const [events, setEvents] = useState<EventOption[]>([])

  // Preview
  const [preview, setPreview] = useState<PreviewData | null>(null)

  // Generate state
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [lastPdfUrl, setLastPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Invoice list
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const [savedStatusId, setSavedStatusId] = useState<string | null>(null)

  // Invoice & deal dijaga requireActivePro (fallback user-level untuk daftar lintas-event) →
  // 402 kalau tidak ada satu pun event Pro aktif. Tanpa ini, halaman tampil kosong seolah
  // belum ada invoice, bukan terkunci.
  const [proLocked, setProLocked] = useState(false)

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([])

  function addToast(message: string, type: Toast["type"] = "success") {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }

  function removeToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  // ── Load on mount ──────────────────────────────────────────────────────────

  useEffect(() => {
    loadSettings()
    loadEvents()
    const dealIdParam = searchParams.get("dealId")
    loadDeals(dealIdParam ?? undefined)
  }, [searchParams])

  // Daftar invoice ikut event aktif — dimuat ulang tiap event berganti.
  useEffect(() => {
    loadInvoices()
  }, [selectedEventId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadEvents() {
    const res = await fetch(`${API_BASE}/events`, { headers: authHeaders() })
    const json = await res.json()
    const list: EventOption[] = Array.isArray(json) ? json : json.data ?? []
    setEvents(list)
  }

  async function loadSettings() {
    const res = await fetch(`${API_BASE}/settings/promoter`, { headers: authHeaders() })
    const json = await res.json()
    if (json.success && json.data) setSettings(json.data)
  }

  async function loadDeals(preselectedDealId?: string) {
    const res = await fetch(`${API_BASE}/sponsor/deals`, { headers: authHeaders() })
    if (res.status === 402) { setProLocked(true); return }
    const json = await res.json()
    if (json.success) {
      const dealList: Deal[] = json.data ?? []
      setDeals(dealList)
      if (preselectedDealId) {
        const found = dealList.find((d) => d.id === preselectedDealId)
        if (found) {
          setSelectedDeal(found)
          setTab("sponsorship")
        }
      }
    }
  }

  async function loadInvoices() {
    // eventId WAJIB di backend sejak 2026-07-20 → tanpa event aktif jangan memanggil
    // sama sekali (akan 400). UI menampilkan ajakan pilih event, bukan daftar kosong.
    if (!selectedEventId) { setInvoices([]); setLoadingInvoices(false); return }
    setLoadingInvoices(true)
    const res = await fetch(`${API_BASE}/invoices?eventId=${selectedEventId}`, { headers: authHeaders() })
    if (res.status === 402) { setProLocked(true); setLoadingInvoices(false); return }
    const json = await res.json()
    if (json.success) setInvoices(json.data ?? [])
    setLoadingInvoices(false)
  }

  // ── Save settings ──────────────────────────────────────────────────────────

  async function saveSettings() {
    setSettingsSaving(true)
    const res = await fetch(`${API_BASE}/settings/promoter`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(settings),
    })
    const json = await res.json()
    if (json.success) {
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)
    }
    setSettingsSaving(false)
  }

  // ── Filtered deals ─────────────────────────────────────────────────────────

  const filteredDeals = deals.filter((d) => {
    const q = dealSearch.toLowerCase()
    return (
      d.sponsorName.toLowerCase().includes(q) ||
      d.email.toLowerCase().includes(q) ||
      d.codeUsed.toLowerCase().includes(q) ||
      d.tier.toLowerCase().includes(q)
    )
  })

  // ── Build items from deal ──────────────────────────────────────────────────

  function itemsFromDeal(deal: Deal): InvoiceItem[] {
    if (deal.dealBenefits.length > 0) {
      return deal.dealBenefits.map((db) => ({
        name: db.benefit.name,
        qty: db.qty,
        unitPrice: Number(db.unitPrice),
        subtotal: Number(db.totalPrice),
      }))
    }
    return [
      {
        name: `Paket Sponsorship – Tier ${deal.tier}`,
        qty: 1,
        unitPrice: Number(deal.totalValue),
        subtotal: Number(deal.totalValue),
      },
    ]
  }

  // ── Build preview data ─────────────────────────────────────────────────────

  function buildPreviewFromDeal(): PreviewData | null {
    if (!selectedDeal) return null
    const items = itemsFromDeal(selectedDeal)
    const grandTotal = items.reduce((s, i) => s + i.subtotal, 0)
    return {
      invoiceNumber: "INV-PREVIEW",
      sponsorName: selectedDeal.sponsorName,
      contactName: selectedDeal.contactName || selectedDeal.sponsorName,
      sponsorEmail: selectedDeal.email,
      promotorName: settings.companyName || "Event Organizer",
      bankName: settings.bankName || "-",
      bankAccount: settings.bankAccount || "-",
      accountHolder: settings.accountHolder || "-",
      items,
      grandTotal,
      bonusItems,
      currentTier: selectedDeal.tier,
      nextTier: null,
      amountToUpgrade: null,
      createdAt: new Date().toISOString(),
    }
  }

  function buildPreviewFromManual(): PreviewData | null {
    const validItems = manualItems.filter((i) => i.name.trim())
    if (validItems.length === 0) return null
    const grandTotal = validItems.reduce((s, i) => s + i.subtotal, 0)
    return {
      invoiceNumber: "INV-PREVIEW",
      sponsorName: "—",
      contactName: "—",
      sponsorEmail: "—",
      promotorName: settings.companyName || "Event Organizer",
      bankName: settings.bankName || "-",
      bankAccount: settings.bankAccount || "-",
      accountHolder: settings.accountHolder || "-",
      items: validItems,
      grandTotal,
      bonusItems,
      currentTier: "—",
      nextTier: null,
      amountToUpgrade: null,
      createdAt: new Date().toISOString(),
    }
  }

  // ── Manual item helpers ────────────────────────────────────────────────────

  function updateManualItem(idx: number, field: keyof InvoiceItem, val: string | number) {
    setManualItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item
        const updated = { ...item, [field]: val }
        updated.subtotal = updated.qty * updated.unitPrice
        return updated
      })
    )
  }

  const manualTotal = manualItems.reduce((s, i) => s + (i.subtotal || 0), 0)

  // ── Generate invoice ───────────────────────────────────────────────────────

  async function handleGenerate(fromDeal: boolean) {
    if (!settings.bankName || !settings.bankAccount || !settings.accountHolder || !settings.companyName) {
      setError("Lengkapi data promotor & rekening di tab Pengaturan terlebih dahulu.")
      return
    }
    if (fromDeal && !selectedDeal) {
      setError("Pilih deal sponsor terlebih dahulu.")
      return
    }
    if (!fromDeal && !selectedEventId) {
      setError("Pilih event terlebih dahulu di Dashboard untuk membuat invoice manual.")
      return
    }
    setError(null)
    setGenerating(true)

    const payload: Record<string, unknown> = {
      // Invoice sponsorship: kirim dealId (eventId & pemilik diturunkan server-side dari deal).
      // Invoice manual: kirim eventId yang dipilih (TIDAK ada dealId — tidak menempel ke deal mana pun).
      dealId: fromDeal ? selectedDeal!.id : undefined,
      eventId: fromDeal ? undefined : selectedEventId,
      promotorName: settings.companyName,
      bankName: settings.bankName,
      bankAccount: settings.bankAccount,
      accountHolder: settings.accountHolder,
      bonusItems,
      invoiceType: fromDeal ? "sponsorship" : "manual",
      invoiceSource: fromDeal ? (selectedDeal!.packageId ? "bundling" : "alacarte") : "alacarte",
      packageId: fromDeal ? (selectedDeal!.packageId || null) : null,
    }

    if (!fromDeal) {
      const validItems = manualItems.filter((i) => i.name.trim())
      if (validItems.length === 0) {
        setError("Tambahkan minimal 1 item tagihan.")
        setGenerating(false)
        return
      }
      payload.manualItems = validItems
      payload.manualGrandTotal = validItems.reduce((s, i) => s + i.subtotal, 0)
    }

    const res = await fetch(`${API_BASE}/invoices/generate`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    setGenerating(false)

    if (!json.success) {
      setError(json.message || "Gagal generate invoice.")
      return
    }

    setLastPdfUrl(json.data?.pdfUrl ?? null)
    loadInvoices()
    setTab("list")
  }

  // ── Download PDF ───────────────────────────────────────────────────────────

  async function downloadPdf(pdfUrl: string, invoiceNumber: string) {
    setDownloading(true)
    try {
      const res = await fetch(`/api/pdf?path=${encodeURIComponent(pdfUrl)}`)
      if (!res.ok) throw new Error("Gagal download")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${invoiceNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert("Gagal mengunduh PDF. Pastikan server berjalan.")
    }
    setDownloading(false)
  }

  // ── Share WhatsApp ─────────────────────────────────────────────────────────

  function shareWhatsApp(inv: InvoiceSummary) {
    const text = `Halo, berikut invoice sponsorship kami:\n\n*${inv.invoiceNumber}*\nSponsor: ${inv.sponsorName}\nTotal: ${IDR.format(Number(inv.grandTotal))}\n\nTerima kasih atas dukungan Anda!`
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, "_blank")
  }

  // ── Delete invoice ─────────────────────────────────────────────────────────

  async function deleteInvoice(id: string) {
    if (!confirm("Hapus invoice ini? Tindakan tidak bisa dibatalkan.")) return
    setDeletingId(id)
    await fetch(`${API_BASE}/invoices/${id}`, { method: "DELETE", headers: authHeaders() })
    setInvoices((prev) => prev.filter((i) => i.id !== id))
    setDeletingId(null)
  }

  // ── Update status ──────────────────────────────────────────────────────────

  async function updateStatus(id: string, status: string) {
    const prev = invoices.find((i) => i.id === id)
    if (!prev || prev.status === status) return

    // Optimistic update
    setInvoices((list) => list.map((i) => (i.id === id ? { ...i, status } : i)))
    setUpdatingStatusId(id)

    try {
      const res = await fetch(`${API_BASE}/invoices/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)

      // Show saved checkmark briefly
      setSavedStatusId(id)
      setTimeout(() => setSavedStatusId((cur) => (cur === id ? null : cur)), 1500)

      if (status === "Lunas") {
        const inv = invoices.find((i) => i.id === id)
        addToast(
          `Invoice ${inv?.invoiceNumber ?? id} ditandai Lunas. Sponsor akan melihat perubahan ini di dashboard mereka.`,
          "success"
        )
      }
    } catch {
      // Rollback
      setInvoices((list) => list.map((i) => (i.id === id ? { ...i, status: prev.status } : i)))
      addToast("Gagal update status. Coba lagi.", "error")
    } finally {
      setUpdatingStatusId(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6">
      {/* Tombol Kembali — teruskan ?eventId= yang dibawa dari Dashboard Kerjasama (round-trip) supaya
          event yang dipilih di hub dipulihkan saat kembali. Halaman Invoice sendiri lintas-event
          (tidak memakai eventId ini untuk daftarnya), hanya meneruskannya kembali. */}
      <div>
        <button
          onClick={() => {
            const backEventId = searchParams.get("eventId")
            router.push(backEventId ? `/dashboard/kerjasama?eventId=${backEventId}` : "/dashboard/kerjasama")
          }}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Dashboard Kerjasama
        </button>
      </div>

      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-slate-900">
          <FileText className="size-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Invoice Sponsor</h1>
          <p className="text-sm text-slate-500">Generate dan kelola invoice untuk event aktif</p>
        </div>
      </div>

      {/* Terkunci Pro (backend 402): tidak ada event Pro aktif → gembok + ajakan upgrade,
          bukan daftar invoice/PO kosong. Tanpa eventId (halaman ini lintas-event). */}
      {proLocked ? (
        <ProLockPanel
          featureName="Invoice Sponsor"
          description="Event ini belum Pro aktif. Invoice sponsor khusus Pro — upgrade event ini untuk membukanya."
        />
      ) : (
      <>
      {/* Purchase Order SUDAH TIDAK di halaman ini (2026-07-20) — pindah ke Dashboard
          Perencanaan. PO adalah alat perencanaan belanja, bukan dokumen kerjasama. */}

      {/* Tab bar — Jenis Invoice */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {[
          { key: "sponsorship", label: "Sponsorship", icon: <BadgeCheck className="size-3.5" />, comingSoon: false },
          { key: "tenant",      label: "Tenant",      icon: <Building2   className="size-3.5" />, comingSoon: true  },
          { key: "manual",      label: "Manual",      icon: <FileText    className="size-3.5" />, comingSoon: false },
        ].map(({ key, label, icon, comingSoon }) => (
          <button
            key={key}
            onClick={() => setTab(key as typeof tab)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all",
              tab === key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.split(" ")[0]}</span>
            {comingSoon && (
              <span className="hidden rounded bg-slate-200 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:inline">
                Soon
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab bar — Navigasi sekunder */}
      <div className="flex gap-1 rounded-lg border border-slate-100 bg-slate-50/60 p-0.5">
        {[
          { key: "list",     label: "Daftar Invoice", icon: <FileText className="size-3.5" /> },
          { key: "settings", label: "Pengaturan",    icon: <Settings className="size-3.5" /> },
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as typeof tab)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              tab === key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: Sponsorship ─────────────────────────────────────────────────── */}
      {tab === "sponsorship" && (
        <div className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <X className="size-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Search deal */}
          <SectionCard title="Cari Deal Sponsor" icon={<Search className="size-4" />}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
                placeholder="Cari nama, email, kode, atau tier..."
                value={dealSearch}
                onChange={(e) => setDealSearch(e.target.value)}
              />
            </div>

            <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
              {filteredDeals.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-400">Tidak ada deal ditemukan.</p>
              )}
              {filteredDeals.map((deal) => (
                <button
                  key={deal.id}
                  onClick={() => setSelectedDeal(selectedDeal?.id === deal.id ? null : deal)}
                  className={cn(
                    "w-full rounded-xl border px-4 py-3 text-left transition-all",
                    selectedDeal?.id === deal.id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn("font-semibold text-sm", selectedDeal?.id === deal.id ? "text-white" : "text-slate-900")}>
                        {deal.sponsorName}
                      </p>
                      <p className={cn("text-xs", selectedDeal?.id === deal.id ? "text-slate-300" : "text-slate-500")}>
                        {deal.email} · Tier {deal.tier} · {deal.codeUsed}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cn("font-mono text-sm font-bold", selectedDeal?.id === deal.id ? "text-emerald-300" : "text-emerald-700")}>
                        {IDR.format(Number(deal.totalValue))}
                      </p>
                      <span className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        deal.status === "Disetujui"
                          ? selectedDeal?.id === deal.id ? "border-emerald-400 bg-emerald-800 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : deal.status === "Ditolak"
                            ? selectedDeal?.id === deal.id ? "border-red-400 text-red-300" : "border-red-200 text-red-600"
                            : selectedDeal?.id === deal.id ? "border-amber-400 text-amber-200" : "border-amber-200 text-amber-700"
                      )}>
                        {deal.status}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Selected deal preview */}
          {selectedDeal && (
            <SectionCard title="Data Invoice" icon={<FileText className="size-4" />}>
              <div className="space-y-4">
                {/* Sponsor info */}
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sponsor</p>
                    <p className="mt-0.5 font-semibold text-slate-900">{selectedDeal.sponsorName}</p>
                    <p className="text-xs text-slate-500">{selectedDeal.email}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tier & Nilai</p>
                    <p className="mt-0.5 font-semibold text-slate-900">Tier {selectedDeal.tier}</p>
                    <p className="font-mono text-sm font-bold text-emerald-700">{IDR.format(Number(selectedDeal.totalValue))}</p>
                  </div>
                </div>

                {/* Items */}
                {selectedDeal.dealBenefits.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Item Benefit</p>
                    <div className="space-y-1.5">
                      {selectedDeal.dealBenefits.map((db, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                          <span className="text-slate-700">{db.qty}× {db.benefit.name}</span>
                          <span className="font-mono text-slate-900">{IDR.format(Number(db.totalPrice))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bonus items */}
                <div>
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Bonus Eksklusif (opsional)
                  </Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      placeholder="Contoh: Merchandise eksklusif"
                      value={bonusInput}
                      onChange={(e) => setBonusInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && bonusInput.trim()) {
                          setBonusItems((p) => [...p, bonusInput.trim()])
                          setBonusInput("")
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (bonusInput.trim()) {
                          setBonusItems((p) => [...p, bonusInput.trim()])
                          setBonusInput("")
                        }
                      }}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  {bonusItems.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {bonusItems.map((b, i) => (
                        <span key={i} className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs text-violet-700">
                          🎁 {b}
                          <button onClick={() => setBonusItems((p) => p.filter((_, j) => j !== i))}>
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Promotor info check */}
                {(!settings.bankName || !settings.companyName) && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                    ⚠️ Data promotor belum lengkap. Isi di tab{" "}
                    <button className="font-semibold underline" onClick={() => setTab("settings")}>Pengaturan</button>.
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      const p = buildPreviewFromDeal()
                      if (p) setPreview(p)
                    }}
                  >
                    <Eye className="size-4" />
                    Preview
                  </Button>
                  <Button
                    className="flex-1 gap-2 bg-slate-900 hover:bg-slate-800"
                    onClick={() => handleGenerate(true)}
                    disabled={generating}
                  >
                    {generating ? <RotateCw className="size-4 animate-spin" /> : <FileText className="size-4" />}
                    {generating ? "Membuat Invoice..." : "Generate & Unduh PDF"}
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* ── TAB: Tenant (Coming Soon) ────────────────────────────────────────── */}
      {tab === "tenant" && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-20 text-center">
          <Clock className="mb-4 size-12 text-slate-200" />
          <p className="text-base font-semibold text-slate-500">Fitur ini sedang dalam pengembangan.</p>
          <p className="mt-1.5 text-sm text-slate-400">Invoice Tenant akan segera tersedia.</p>
        </div>
      )}

      {/* ── TAB: Manual ──────────────────────────────────────────────────────── */}
      {tab === "manual" && (
        <div className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <X className="size-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Dropdown event lokal DIHAPUS 2026-07-20 — event tunggal berasal dari
              EventProvider (dipilih di Dashboard KPI), jadi di sini read-only. */}
          <SectionCard title="Event" icon={<Building2 className="size-4" />}>
            {selectedEventId ? (
              <>
                <p className="text-sm font-medium text-slate-900">
                  {events.find((ev) => String(ev.id) === selectedEventId)?.title ?? "Event aktif"}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Invoice manual akan ditautkan ke event aktif ini (bukan ke deal sponsor).
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Belum ada event dipilih. Pilih event di{" "}
                <Link href="/dashboard" className="font-semibold text-emerald-700 underline">
                  Dashboard
                </Link>{" "}
                terlebih dahulu.
              </p>
            )}
          </SectionCard>

          <SectionCard title="Item Tagihan" icon={<FileText className="size-4" />}>
            <div className="space-y-2">
              {/* Header kolom */}
              <div className="grid grid-cols-12 gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <span className="col-span-5">Nama Item</span>
                <span className="col-span-2 text-center">Qty</span>
                <span className="col-span-3 text-right">Harga Satuan</span>
                <span className="col-span-2 text-right">Subtotal</span>
              </div>

              {manualItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 items-center gap-2">
                  <input
                    className="col-span-5 rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-slate-400"
                    placeholder="Nama item..."
                    value={item.name}
                    onChange={(e) => updateManualItem(idx, "name", e.target.value)}
                  />
                  <input
                    type="number"
                    min={1}
                    className="col-span-2 rounded-lg border border-slate-200 px-2 py-2 text-center text-sm outline-none focus:border-slate-400"
                    value={item.qty}
                    onChange={(e) => updateManualItem(idx, "qty", Number(e.target.value) || 1)}
                  />
                  <input
                    type="number"
                    min={0}
                    className="col-span-3 rounded-lg border border-slate-200 px-2.5 py-2 text-right text-sm outline-none focus:border-slate-400"
                    placeholder="0"
                    value={item.unitPrice || ""}
                    onChange={(e) => updateManualItem(idx, "unitPrice", Number(e.target.value) || 0)}
                  />
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <span className="text-right text-sm font-semibold text-slate-700">
                      {IDR.format(item.subtotal)}
                    </span>
                    {manualItems.length > 1 && (
                      <button
                        onClick={() => setManualItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="ml-1 text-slate-300 hover:text-red-400"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button
                onClick={() => setManualItems((prev) => [...prev, { name: "", qty: 1, unitPrice: 0, subtotal: 0 }])}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
              >
                <Plus className="size-3.5" />
                Tambah Item
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Grand Total</span>
              <span className="font-mono text-lg font-bold text-emerald-700">{IDR.format(manualTotal)}</span>
            </div>
          </SectionCard>

          {(!settings.bankName || !settings.companyName) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              ⚠️ Data promotor belum lengkap. Isi di tab{" "}
              <button className="font-semibold underline" onClick={() => setTab("settings")}>Pengaturan</button>.
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                const p = buildPreviewFromManual()
                if (p) setPreview(p)
              }}
            >
              <Eye className="size-4" />
              Preview
            </Button>
            <Button
              className="flex-1 gap-2 bg-slate-900 hover:bg-slate-800"
              onClick={() => handleGenerate(false)}
              disabled={generating}
            >
              {generating ? <RotateCw className="size-4 animate-spin" /> : <FileText className="size-4" />}
              {generating ? "Membuat Invoice..." : "Generate & Unduh PDF"}
            </Button>
          </div>
        </div>
      )}

      {/* ── TAB: Invoice List ─────────────────────────────────────────────────── */}
      {tab === "list" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{invoices.length} invoice untuk event ini</p>
            <Button variant="outline" size="sm" onClick={loadInvoices} className="gap-2">
              <RotateCw className="size-3.5" />
              Refresh
            </Button>
          </div>

          {loadingInvoices && (
            <div className="py-12 text-center text-slate-400">
              <RotateCw className="mx-auto size-5 animate-spin" />
            </div>
          )}

          {!loadingInvoices && invoices.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400">
              <FileText className="mx-auto mb-3 size-10 opacity-30" />
              {selectedEventId ? (
                <>
                  <p className="font-medium">Belum ada invoice untuk event ini.</p>
                  <p className="mt-1 text-sm">Klik Buat Invoice untuk memulai.</p>
                </>
              ) : (
                <>
                  <p className="font-medium">Belum ada event dipilih.</p>
                  <p className="mt-1 text-sm">
                    Pilih event di{" "}
                    <Link href="/dashboard" className="font-semibold text-emerald-700 underline">
                      Dashboard
                    </Link>{" "}
                    untuk melihat invoicenya.
                  </p>
                </>
              )}
            </div>
          )}

          <div className="space-y-3">
            {invoices.map((inv) => (
              <div key={inv.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-slate-900">{inv.invoiceNumber}</span>
                      <span className={cn("rounded-full border px-2.5 py-0.5 text-[10px] font-semibold", statusColor(inv.status))}>
                        {inv.status}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
                        Tier {inv.currentTier}
                      </span>
                    </div>
                    <p className="mt-1 font-semibold text-slate-800">{inv.sponsorName}</p>
                    <p className="text-xs text-slate-500">
                      {inv.contactName} ·{" "}
                      {new Date(inv.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    <p className="mt-1 font-mono text-base font-bold text-emerald-700">{IDR.format(Number(inv.grandTotal))}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    {/* Status change */}
                    <div className="flex items-center gap-1.5">
                      <select
                        value={inv.status}
                        disabled={updatingStatusId === inv.id}
                        onChange={(e) => updateStatus(inv.id, e.target.value)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none"
                      >
                        {INVOICE_STATUS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      {updatingStatusId === inv.id && (
                        <RotateCw className="size-3.5 animate-spin text-slate-400" />
                      )}
                      {savedStatusId === inv.id && updatingStatusId !== inv.id && (
                        <CheckCircle2 className="size-3.5 text-emerald-600" />
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      {inv.pdfUrl && (
                        <>
                          <button
                            onClick={() => downloadPdf(inv.pdfUrl!, inv.invoiceNumber)}
                            disabled={downloading}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                            title="Unduh PDF"
                          >
                            <Download className="size-3.5" />
                            PDF
                          </button>
                          <button
                            onClick={() => shareWhatsApp(inv)}
                            className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100"
                            title="Kirim via WhatsApp"
                          >
                            <MessageCircle className="size-3.5" />
                            WA
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => deleteInvoice(inv.id)}
                        disabled={deletingId === inv.id}
                        className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50"
                        title="Hapus invoice"
                      >
                        {deletingId === inv.id ? <RotateCw className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: Pengaturan ───────────────────────────────────────────────────── */}
      {tab === "settings" && (
        <SectionCard title="Data Promotor & Rekening" icon={<Settings className="size-4" />}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cName">Nama Perusahaan / EO</Label>
                <Input
                  id="cName"
                  className="mt-1"
                  placeholder="nexEvent Entertainment"
                  value={settings.companyName ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, companyName: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="bankName">Nama Bank</Label>
                <Input
                  id="bankName"
                  className="mt-1"
                  placeholder="BCA / BNI / Mandiri"
                  value={settings.bankName ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, bankName: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="bankAcc">Nomor Rekening</Label>
                <Input
                  id="bankAcc"
                  className="mt-1"
                  placeholder="1234567890"
                  value={settings.bankAccount ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, bankAccount: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="accHolder">Atas Nama</Label>
                <Input
                  id="accHolder"
                  className="mt-1"
                  placeholder="PT nexEvent Nusantara"
                  value={settings.accountHolder ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, accountHolder: e.target.value }))}
                />
              </div>
            </div>
            <Button
              className="gap-2 bg-slate-900 hover:bg-slate-800"
              onClick={saveSettings}
              disabled={settingsSaving}
            >
              {settingsSaving ? <RotateCw className="size-4 animate-spin" /> : settingsSaved ? <BadgeCheck className="size-4" /> : <Save className="size-4" />}
              {settingsSaved ? "Tersimpan!" : "Simpan Pengaturan"}
            </Button>
          </div>
        </SectionCard>
      )}

      {/* Preview modal */}
      {preview && (
        <InvoicePreview
          data={preview}
          onClose={() => setPreview(null)}
          onDownload={async () => {
            // Preview mode — generate actual PDF
            await handleGenerate(tab === "sponsorship")
            setPreview(null)
          }}
          downloading={generating}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />

      </>
      )}
    </div>
  )
}

