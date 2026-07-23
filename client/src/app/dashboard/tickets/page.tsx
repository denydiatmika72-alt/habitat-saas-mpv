"use client"

import { Suspense, useEffect, useState, useCallback } from "react"
import { Ticket as TicketIcon, Plus, Trash2, Pencil, Copy, Check, ExternalLink, Upload, Package, ArrowLeftRight, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useSelectedEvent, useEventGuard } from "@/contexts/event-context"
import { useUser } from "@/hooks/useUser"
import { formatIDRInput, parseIDRInput } from "@/lib/formatNumber"

type Event = { id: string; title: string }

type FeeBearer = "audience" | "promotor"

type Facility = { id: string; name: string; isCustom?: boolean }

type FullEvent = {
  id: string
  title: string
  slug: string | null
  saleStartAt: string | null
  saleEndAt: string | null
  storefrontStatus: "draft" | "pending_approval" | "approved" | "rejected"
  storefrontNote: string | null
  bannerUrl: string | null
  logoUrl: string | null
  taxEnabled: boolean
  feeBearer: FeeBearer | null
  platformFeePercent: number | null
  description: string | null
  facilities: Facility[] | null
  termsConditions: string | null
}

const DEFAULT_FACILITIES: Facility[] = [
  { id: "toilet", name: "Toilet tersedia" },
  { id: "musholla", name: "Musholla / Tempat ibadah" },
  { id: "parkir_motor", name: "Area parkir motor" },
  { id: "parkir_mobil", name: "Area parkir mobil" },
  { id: "titip_helm", name: "Penitipan helm" },
  { id: "atm", name: "ATM / Kasir tunai" },
  { id: "kantin", name: "Kantin / Food court" },
  { id: "air_minum", name: "Free drinking water" },
  { id: "p3k", name: "First aid / P3K" },
  { id: "smoking", name: "Smoking area" },
  { id: "photo_booth", name: "Photo booth" },
  { id: "merch", name: "Merchandise booth" },
  { id: "difabel", name: "Ramah difabel" },
  { id: "shuttle", name: "Shuttle tersedia" },
  { id: "dekat_transport", name: "Dekat stasiun/halte" },
]

const DEFAULT_TERMS_TEMPLATE = `1. Tiket yang sudah dibeli tidak dapat dikembalikan atau ditukar.
2. Harap membawa identitas diri (KTP/SIM) yang sesuai dengan data pembelian tiket.
3. Dilarang membawa senjata tajam, narkoba, atau benda berbahaya lainnya.
4. Penyelenggara berhak menolak masuk pengunjung yang tidak memenuhi syarat.
5. Tiket hanya berlaku untuk 1 (satu) orang dan tidak dapat dipindahtangankan.
6. Penyelenggara tidak bertanggung jawab atas kehilangan barang bawaan pengunjung.
7. Dengan membeli tiket, pengunjung menyetujui seluruh syarat dan ketentuan ini.`

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${checked ? "bg-emerald-600" : "bg-slate-200"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  )
}

type TicketType = {
  id: string
  name: string
  description: string | null
  price: number
  quota: number
  sold: number
  isActive: boolean
  // Fee per-kategori (arsitektur 2026-07-15): null = admin belum menetapkan → belum bisa dijual.
  feePercent: number | null
  feeLockedAt: string | null
}

// Badge status fee untuk kategori (tiket/merch/paket). Dipakai supaya promotor paham kenapa
// kategorinya belum tampil di storefront — bukan karena error, tapi menunggu admin set fee.
function FeeStatusBadge({ feePercent }: { feePercent: number | null }) {
  if (feePercent === null) {
    return (
      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
        Menunggu Setup Fee — belum bisa dijual
      </span>
    )
  }
  return (
    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
      Fee {feePercent}%
    </span>
  )
}

type Order = {
  id: string
  orderId: string
  buyerName: string
  buyerEmail: string
  totalAmount: number
  status: string
  orderType?: string
  createdAt: string
  items: { quantity: number; ticketType: { name: string } }[]
  merchItems?: { quantity: number; item: { name: string }; variant: { size: string } }[]
}

type MerchVariant = {
  id: string
  size: string
  stock: number
  sold: number
}

type MerchItem = {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  isActive: boolean
  approvalStatus: "pending" | "approved" | "rejected"
  approvalNote: string | null
  variants: MerchVariant[]
  feePercent: number | null
  feeLockedAt: string | null
}

type BundleItemDraft = {
  itemType: "ticket" | "merch"
  ticketTypeId: string | null
  merchItemId: string | null
  quantity: number
  label: string
}

type Bundle = {
  id: string
  name: string
  description: string | null
  price: number
  imageUrl: string | null
  isActive: boolean
  approvalStatus: "pending" | "approved" | "rejected"
  approvalNote: string | null
  feePercent: number | null
  feeLockedAt: string | null
  items: {
    id: string
    itemType: "ticket" | "merch"
    ticketTypeId: string | null
    merchItemId: string | null
    quantity: number
    label: string
  }[]
}

const MERCH_SIZES = ["S", "M", "L", "XL", "XXL", "FREE SIZE"]

const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })

const getToken = () => (typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : "")
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" })

const STATUS_LABEL: Record<FullEvent["storefrontStatus"], { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  pending_approval: { label: "Menunggu Persetujuan", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Disetujui", className: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Ditolak", className: "bg-red-100 text-red-700" },
}

const ORDER_STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-700",
  expired: "bg-slate-100 text-slate-500",
  cancelled: "bg-red-100 text-red-700",
}

function toLocalInputValue(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// useSearchParams (Next 16) WAJIB dibungkus <Suspense> — tanpa ini build gagal / halaman jatuh ke
// dynamic rendering. Pola wrapper + *Inner sama dgn expenses/event-summary/ticketing.
export default function TicketsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">Memuat...</div>}>
      <TicketsPageInner />
    </Suspense>
  )
}

function TicketsPageInner() {
  const { loading: userLoading } = useUser()

  const [events, setEvents] = useState<Event[]>([])
  // Event diwarisi dari EventProvider — halaman ini bukan pintu masuk sendiri.
  // Sengaja dari context, BUKAN searchParams: URL menyusul satu tick setelah navigasi,
  // jadi guard berbasis URL bisa salah memantulkan user yang sudah memilih event.
  const { selectedEventId } = useSelectedEvent()
  const [event, setEvent] = useState<FullEvent | null>(null)
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [merchItems, setMerchItems] = useState<MerchItem[]>([])
  const [newMerchName, setNewMerchName] = useState("")
  const [newMerchDescription, setNewMerchDescription] = useState("")
  const [newMerchPrice, setNewMerchPrice] = useState("")
  const [newMerchVariants, setNewMerchVariants] = useState<Record<string, number>>({})
  const [addingMerch, setAddingMerch] = useState(false)
  const [merchError, setMerchError] = useState("")
  const [uploadingMerchId, setUploadingMerchId] = useState<string | null>(null)

  const [bundles, setBundles] = useState<Bundle[]>([])
  const [newBundleName, setNewBundleName] = useState("")
  const [newBundleDescription, setNewBundleDescription] = useState("")
  const [newBundlePrice, setNewBundlePrice] = useState("")
  const [bundleDraftItems, setBundleDraftItems] = useState<BundleItemDraft[]>([])
  const [selItemType, setSelItemType] = useState<"ticket" | "merch">("ticket")
  const [selTicketTypeId, setSelTicketTypeId] = useState("")
  const [selMerchItemId, setSelMerchItemId] = useState("")
  const [selItemQty, setSelItemQty] = useState(1)
  const [addingBundle, setAddingBundle] = useState(false)
  const [bundleError, setBundleError] = useState("")
  const [uploadingBundleId, setUploadingBundleId] = useState<string | null>(null)

  const [newType, setNewType] = useState({ name: "", description: "", price: "", quota: "" })
  const [addingType, setAddingType] = useState(false)
  const [typeError, setTypeError] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ name: "", price: "", quota: "" })

  // Edit stok merch per varian (Storefront Roadmap #2)
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null)
  const [variantStockDraft, setVariantStockDraft] = useState("")
  const [variantStockError, setVariantStockError] = useState("")

  // Pindah stok antar jenis tiket (Storefront Roadmap #2)
  const [transferSourceId, setTransferSourceId] = useState<string | null>(null)
  const [transferDest, setTransferDest] = useState("")
  const [transferQty, setTransferQty] = useState("")
  const [transferError, setTransferError] = useState("")
  const [transferring, setTransferring] = useState(false)

  const [saleStart, setSaleStart] = useState("")
  const [saleEnd, setSaleEnd] = useState("")
  const [submittingApproval, setSubmittingApproval] = useState(false)
  const [approvalError, setApprovalError] = useState("")
  const [copied, setCopied] = useState(false)

  // Ticket Box Offline: QR untuk crew jual tiket cash/transfer di lokasi.
  const [ticketBoxUrl, setTicketBoxUrl] = useState("")
  const [ticketBoxQr, setTicketBoxQr] = useState("")
  const [generatingBoxQr, setGeneratingBoxQr] = useState(false)
  const [ticketBoxError, setTicketBoxError] = useState("")
  const [boxCopied, setBoxCopied] = useState(false)

  const [savingFeeBearer, setSavingFeeBearer] = useState(false)
  const [savingTax, setSavingTax] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadError, setUploadError] = useState("")

  const [description, setDescription] = useState("")
  const [selectedFacilities, setSelectedFacilities] = useState<Facility[]>([])
  const [customFacility, setCustomFacility] = useState("")
  const [termsConditions, setTermsConditions] = useState("")
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoSaved, setInfoSaved] = useState(false)

  // `eventsReady` HANYA true kalau daftar event benar-benar berhasil dimuat —
  // daftar kosong akibat request gagal tidak boleh dianggap "event sudah dihapus".
  const [eventsReady, setEventsReady] = useState(false)

  useEffect(() => {
    fetch("/api/events", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.success) { setEvents(data.data); setEventsReady(true) } })
      .catch(() => {})
  }, [])

  // Tanpa konteks event (akses langsung via URL/bookmark) → balik ke pintu utama
  // kategori Tiket & Pencairan. Event terpilih sudah dihapus → balik ke Dashboard
  // KPI + pesan penjelas.
  useEventGuard({ events, ready: eventsReady, emptyHref: "/dashboard/ticketing" })

  const fetchDetail = useCallback(async () => {
    if (!selectedEventId) return
    setLoadingDetail(true)
    try {
      const [evRes, ttRes, ordRes, merchRes, bundleRes] = await Promise.all([
        fetch(`/api/events/${selectedEventId}`, { headers: authHeaders() }),
        fetch(`/api/tickets/types?eventId=${selectedEventId}`, { headers: authHeaders() }),
        fetch(`/api/tickets/orders?eventId=${selectedEventId}`, { headers: authHeaders() }),
        fetch(`/api/merch/items?eventId=${selectedEventId}`, { headers: authHeaders() }),
        fetch(`/api/bundles?eventId=${selectedEventId}`, { headers: authHeaders() }),
      ])
      const [evData, ttData, ordData, merchData, bundleData] = await Promise.all([evRes.json(), ttRes.json(), ordRes.json(), merchRes.json(), bundleRes.json()])
      if (evData.success) {
        setEvent(evData.data)
        setSaleStart(toLocalInputValue(evData.data.saleStartAt))
        setSaleEnd(toLocalInputValue(evData.data.saleEndAt))
        setDescription(evData.data.description || "")
        setSelectedFacilities(Array.isArray(evData.data.facilities) ? evData.data.facilities : [])
        setTermsConditions(evData.data.termsConditions || "")
      }
      if (ttData.success) setTicketTypes(ttData.data)
      if (ordData.success) setOrders(ordData.data)
      if (merchData.success) setMerchItems(merchData.data)
      if (bundleData.success) setBundles(bundleData.data)
    } catch {}
    finally { setLoadingDetail(false) }
  }, [selectedEventId])

  useEffect(() => {
    setEvent(null)
    setTicketTypes([])
    setOrders([])
    setMerchItems([])
    setBundles([])
    setBundleDraftItems([])
    setDescription("")
    setSelectedFacilities([])
    setTermsConditions("")
    setTicketBoxUrl("")
    setTicketBoxQr("")
    setTicketBoxError("")
    fetchDetail()
  }, [selectedEventId, fetchDetail])

  // rotate:true = terbitkan token keamanan BARU (QR/link lama langsung mati) — dipakai kalau
  // token dicurigai bocor. Tanpa rotate, token existing dipertahankan → QR stabil utk dicetak.
  const handleGenerateTicketBoxQR = async (rotate = false) => {
    if (!selectedEventId) return
    if (
      rotate &&
      !confirm(
        "Buat ulang QR dengan token baru?\n\nQR & link Ticket Box yang LAMA langsung tidak berlaku — " +
          "QR yang sudah dicetak/disebar harus diganti dengan yang baru."
      )
    )
      return
    setTicketBoxError("")
    setGeneratingBoxQr(true)
    try {
      const res = await fetch("/api/tickets/ticket-box/generate-qr", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ eventId: selectedEventId, rotate }),
      })
      const data = await res.json()
      if (data.success) {
        setTicketBoxUrl(data.url)
        setTicketBoxQr(data.qrDataUrl)
      } else {
        setTicketBoxError(data.message || "Gagal membuat QR Ticket Box.")
      }
    } catch {
      setTicketBoxError("Gagal menghubungi server.")
    } finally {
      setGeneratingBoxQr(false)
    }
  }

  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault()
    setTypeError("")
    if (!newType.name || !newType.price || !newType.quota) return
    setAddingType(true)
    try {
      const res = await fetch("/api/tickets/types", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          eventId: selectedEventId,
          name: newType.name,
          description: newType.description || undefined,
          price: parseIDRInput(newType.price),
          quota: Number(newType.quota),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setTicketTypes((prev) => [...prev, data.data])
        setNewType({ name: "", description: "", price: "", quota: "" })
      } else {
        setTypeError(data.message || "Gagal menambah jenis tiket.")
      }
    } catch {
      setTypeError("Gagal menghubungi server.")
    } finally {
      setAddingType(false)
    }
  }

  const startEdit = (tt: TicketType) => {
    setEditingId(tt.id)
    setEditDraft({ name: tt.name, price: formatIDRInput(String(tt.price)), quota: String(tt.quota) })
  }

  const saveEdit = async (id: string) => {
    try {
      // Kuota (stok) hanya dikirim kalau gate lolos (storefront approved). Sebelum approve,
      // promotor masih boleh perbaiki nama/harga saat setup, tapi kuota terkunci — cermin backend.
      const body: { name: string; price: number; quota?: number } = {
        name: editDraft.name,
        price: parseIDRInput(editDraft.price),
      }
      if (canEditStock) body.quota = Number(editDraft.quota)
      const res = await fetch(`/api/tickets/types/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        setTicketTypes((prev) => prev.map((t) => (t.id === id ? data.data : t)))
        setEditingId(null)
      } else {
        alert(data.message || "Gagal menyimpan perubahan.")
      }
    } catch {
      alert("Gagal menghubungi server.")
    }
  }

  const toggleActive = async (tt: TicketType) => {
    const res = await fetch(`/api/tickets/types/${tt.id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ isActive: !tt.isActive }),
    })
    const data = await res.json()
    if (data.success) setTicketTypes((prev) => prev.map((t) => (t.id === tt.id ? data.data : t)))
  }

  const deleteType = async (id: string) => {
    if (!confirm("Hapus jenis tiket ini?")) return
    const res = await fetch(`/api/tickets/types/${id}`, { method: "DELETE", headers: authHeaders() })
    const data = await res.json()
    if (data.success) setTicketTypes((prev) => prev.filter((t) => t.id !== id))
    else alert(data.message || "Gagal menghapus jenis tiket.")
  }

  const startTransfer = (tt: TicketType) => {
    setTransferSourceId(tt.id)
    setTransferDest("")
    setTransferQty("")
    setTransferError("")
    setEditingId(null)
  }

  const handleTransferStock = async (sourceId: string) => {
    setTransferError("")
    const qty = Number(transferQty)
    if (!transferDest) { setTransferError("Pilih jenis tiket tujuan."); return }
    if (!Number.isInteger(qty) || qty <= 0) { setTransferError("Jumlah harus bilangan bulat lebih dari 0."); return }
    const source = ticketTypes.find((t) => t.id === sourceId)
    const dest = ticketTypes.find((t) => t.id === transferDest)
    if (!source || !dest) return
    if (qty > source.quota - source.sold) {
      setTransferError(`Stok tersedia di ${source.name} hanya ${source.quota - source.sold}.`)
      return
    }
    if (!confirm(`Pindahkan ${qty} stok dari "${source.name}" (kuota ${source.quota} → ${source.quota - qty}) ke "${dest.name}" (kuota ${dest.quota} → ${dest.quota + qty})?`)) return
    setTransferring(true)
    try {
      const res = await fetch(`/api/tickets/types/${sourceId}/transfer-stock`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ destinationId: transferDest, quantity: qty }),
      })
      const data = await res.json()
      if (data.success) {
        setTicketTypes((prev) => prev.map((t) => {
          if (t.id === data.data.source.id) return data.data.source
          if (t.id === data.data.destination.id) return data.data.destination
          return t
        }))
        setTransferSourceId(null)
        setTransferDest("")
        setTransferQty("")
      } else {
        setTransferError(data.message || "Gagal memindah stok.")
      }
    } catch {
      setTransferError("Gagal menghubungi server.")
    } finally {
      setTransferring(false)
    }
  }

  const handleAddMerch = async () => {
    setMerchError("")
    if (!newMerchName.trim() || !newMerchPrice) {
      setMerchError("Nama produk dan harga wajib diisi.")
      return
    }
    const variants = MERCH_SIZES
      .filter((size) => (newMerchVariants[size] || 0) > 0)
      .map((size) => ({ size, stock: newMerchVariants[size] }))
    if (variants.length === 0) {
      setMerchError("Isi stok minimal 1 size.")
      return
    }
    setAddingMerch(true)
    try {
      const res = await fetch("/api/merch/items", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          eventId: selectedEventId,
          name: newMerchName.trim(),
          description: newMerchDescription.trim() || undefined,
          price: parseIDRInput(newMerchPrice),
          variants,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setMerchItems((prev) => [...prev, data.data])
        setNewMerchName("")
        setNewMerchDescription("")
        setNewMerchPrice("")
        setNewMerchVariants({})
      } else {
        setMerchError(data.message || "Gagal menambah produk.")
      }
    } catch {
      setMerchError("Gagal menghubungi server.")
    } finally {
      setAddingMerch(false)
    }
  }

  const handleToggleMerchActive = async (id: string, isActive: boolean) => {
    const res = await fetch(`/api/merch/items/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ isActive }),
    })
    const data = await res.json()
    if (data.success) setMerchItems((prev) => prev.map((m) => (m.id === id ? data.data : m)))
  }

  const handleDeleteMerch = async (id: string) => {
    if (!confirm("Hapus produk merchandise ini?")) return
    const res = await fetch(`/api/merch/items/${id}`, { method: "DELETE", headers: authHeaders() })
    const data = await res.json()
    if (data.success) setMerchItems((prev) => prev.filter((m) => m.id !== id))
    else alert(data.message || "Gagal menghapus produk.")
  }

  const handleUploadMerchImage = async (id: string, file: File | null | undefined) => {
    if (!file) return
    setUploadingMerchId(id)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`/api/merch/items/${id}/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      })
      const data = await res.json()
      if (data.success) setMerchItems((prev) => prev.map((m) => (m.id === id ? { ...m, imageUrl: data.url } : m)))
      else alert(data.message || "Gagal upload foto produk.")
    } catch {
      alert("Gagal menghubungi server.")
    } finally {
      setUploadingMerchId(null)
    }
  }

  const startEditVariant = (v: MerchVariant) => {
    setEditingVariantId(v.id)
    setVariantStockDraft(String(v.stock))
    setVariantStockError("")
  }

  const saveVariantStock = async (variantId: string, merchItemId: string) => {
    setVariantStockError("")
    const stock = Number(variantStockDraft)
    if (!Number.isInteger(stock) || stock < 0) { setVariantStockError("Stok harus bilangan bulat ≥ 0."); return }
    try {
      const res = await fetch(`/api/merch/variants/${variantId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ stock }),
      })
      const data = await res.json()
      if (data.success) {
        setMerchItems((prev) => prev.map((m) => (
          m.id === merchItemId
            ? { ...m, variants: m.variants.map((v) => (v.id === variantId ? data.data : v)) }
            : m
        )))
        setEditingVariantId(null)
      } else {
        setVariantStockError(data.message || "Gagal menyimpan stok.")
      }
    } catch {
      setVariantStockError("Gagal menghubungi server.")
    }
  }

  const addItemToBundleDraft = () => {
    setBundleError("")
    if (selItemType === "ticket") {
      const tt = ticketTypes.find((t) => t.id === selTicketTypeId)
      if (!tt) return setBundleError("Pilih jenis tiket dulu.")
      setBundleDraftItems((prev) => [
        ...prev,
        { itemType: "ticket", ticketTypeId: tt.id, merchItemId: null, quantity: selItemQty, label: tt.name },
      ])
    } else {
      // Merch di paket = PRODUK (tanpa size). Size dipilih pembeli saat checkout.
      const mi = merchItems.find((m) => m.id === selMerchItemId)
      if (!mi) return setBundleError("Pilih produk merch dulu.")
      setBundleDraftItems((prev) => [
        ...prev,
        {
          itemType: "merch",
          ticketTypeId: null,
          merchItemId: mi.id,
          quantity: selItemQty,
          label: mi.name,
        },
      ])
    }
    setSelItemQty(1)
    setSelTicketTypeId("")
    setSelMerchItemId("")
  }

  const removeBundleDraftItem = (idx: number) => {
    setBundleDraftItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleAddBundle = async () => {
    setBundleError("")
    if (!newBundleName.trim() || !newBundlePrice) {
      setBundleError("Nama paket dan harga total wajib diisi.")
      return
    }
    if (bundleDraftItems.length === 0) {
      setBundleError("Paket harus berisi minimal 1 item.")
      return
    }
    setAddingBundle(true)
    try {
      const res = await fetch("/api/bundles", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          eventId: selectedEventId,
          name: newBundleName.trim(),
          description: newBundleDescription.trim() || undefined,
          price: parseIDRInput(newBundlePrice),
          items: bundleDraftItems.map((it) => ({
            itemType: it.itemType,
            ticketTypeId: it.ticketTypeId ?? undefined,
            merchItemId: it.merchItemId ?? undefined,
            quantity: it.quantity,
          })),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setBundles((prev) => [...prev, data.data])
        setNewBundleName("")
        setNewBundleDescription("")
        setNewBundlePrice("")
        setBundleDraftItems([])
      } else {
        setBundleError(data.message || "Gagal membuat paket.")
      }
    } catch {
      setBundleError("Gagal menghubungi server.")
    } finally {
      setAddingBundle(false)
    }
  }

  const handleToggleBundleActive = async (id: string, isActive: boolean) => {
    const res = await fetch(`/api/bundles/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ isActive }),
    })
    const data = await res.json()
    if (data.success) setBundles((prev) => prev.map((b) => (b.id === id ? data.data : b)))
  }

  const handleDeleteBundle = async (id: string) => {
    if (!confirm("Hapus paket bundling ini?")) return
    const res = await fetch(`/api/bundles/${id}`, { method: "DELETE", headers: authHeaders() })
    const data = await res.json()
    if (data.success) setBundles((prev) => prev.filter((b) => b.id !== id))
    else alert(data.message || "Gagal menghapus paket.")
  }

  const handleUploadBundleImage = async (id: string, file: File | null | undefined) => {
    if (!file) return
    setUploadingBundleId(id)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`/api/bundles/${id}/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      })
      const data = await res.json()
      if (data.success) setBundles((prev) => prev.map((b) => (b.id === id ? { ...b, imageUrl: data.url } : b)))
      else alert(data.message || "Gagal upload foto paket.")
    } catch {
      alert("Gagal menghubungi server.")
    } finally {
      setUploadingBundleId(null)
    }
  }

  const requestApproval = async () => {
    setApprovalError("")
    if (!saleStart || !saleEnd) {
      setApprovalError("Tanggal mulai dan selesai jual wajib diisi.")
      return
    }
    setSubmittingApproval(true)
    try {
      const res = await fetch("/api/tickets/request-approval", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          eventId: selectedEventId,
          saleStartAt: new Date(saleStart).toISOString(),
          saleEndAt: new Date(saleEnd).toISOString(),
        }),
      })
      const data = await res.json()
      if (data.success) setEvent(data.data)
      else setApprovalError(data.message || "Gagal mengajukan persetujuan.")
    } catch {
      setApprovalError("Gagal menghubungi server.")
    } finally {
      setSubmittingApproval(false)
    }
  }

  const saveStorefrontSettings = async (patch: Partial<Pick<FullEvent, "feeBearer" | "taxEnabled" | "bannerUrl" | "logoUrl">>) => {
    const res = await fetch("/api/tickets/storefront-settings", {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ eventId: selectedEventId, ...patch }),
    })
    const data = await res.json()
    if (data.success) setEvent(data.data)
    return data
  }

  const handleSetFeeBearer = async (bearer: FeeBearer) => {
    setSavingFeeBearer(true)
    try {
      await saveStorefrontSettings({ feeBearer: bearer })
    } finally {
      setSavingFeeBearer(false)
    }
  }

  const handleToggleTax = async () => {
    if (!event) return
    setSavingTax(true)
    try {
      await saveStorefrontSettings({ taxEnabled: !event.taxEnabled })
    } finally {
      setSavingTax(false)
    }
  }

  const handleUploadBanner = async (file: File | null | undefined) => {
    setUploadError("")
    if (!file) {
      await saveStorefrontSettings({ bannerUrl: null })
      return
    }
    setUploadingBanner(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("eventId", selectedEventId)
      const res = await fetch("/api/upload/event-banner", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      })
      const data = await res.json()
      if (data.success) setEvent((prev) => (prev ? { ...prev, bannerUrl: data.url } : prev))
      else setUploadError(data.message || "Gagal upload banner.")
    } catch {
      setUploadError("Gagal menghubungi server.")
    } finally {
      setUploadingBanner(false)
    }
  }

  const handleUploadLogo = async (file: File | null | undefined) => {
    setUploadError("")
    if (!file) {
      await saveStorefrontSettings({ logoUrl: null })
      return
    }
    setUploadingLogo(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("eventId", selectedEventId)
      const res = await fetch("/api/upload/event-logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      })
      const data = await res.json()
      if (data.success) setEvent((prev) => (prev ? { ...prev, logoUrl: data.url } : prev))
      else setUploadError(data.message || "Gagal upload logo.")
    } catch {
      setUploadError("Gagal menghubungi server.")
    } finally {
      setUploadingLogo(false)
    }
  }

  const toggleFacility = (facility: Facility) => {
    setSelectedFacilities((prev) =>
      prev.some((f) => f.id === facility.id) ? prev.filter((f) => f.id !== facility.id) : [...prev, facility]
    )
  }

  const addCustomFacility = () => {
    const name = customFacility.trim()
    if (!name) return
    const id = `custom_${Date.now()}`
    setSelectedFacilities((prev) => [...prev, { id, name, isCustom: true }])
    setCustomFacility("")
  }

  const removeFacility = (id: string) => {
    setSelectedFacilities((prev) => prev.filter((f) => f.id !== id))
  }

  const saveEventInfo = async () => {
    setSavingInfo(true)
    setInfoSaved(false)
    try {
      const res = await fetch("/api/tickets/event-info", {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ eventId: selectedEventId, description, facilities: selectedFacilities, termsConditions }),
      })
      const data = await res.json()
      if (data.success) {
        setEvent((prev) => (prev ? { ...prev, description, facilities: selectedFacilities, termsConditions } : prev))
        setInfoSaved(true)
        setTimeout(() => setInfoSaved(false), 2000)
      } else {
        alert(data.message || "Gagal menyimpan informasi.")
      }
    } catch {
      alert("Gagal menghubungi server.")
    } finally {
      setSavingInfo(false)
    }
  }

  // Judul event aktif untuk header (dropdown pilih event sudah dihapus — event diwarisi dari hub).
  // Pola sama dgn Expense Tracker; daftar `events` yang dulu mengisi dropdown tetap dipakai di sini,
  // jadi fetch /api/events yang sudah ada tidak berubah & tidak jadi kode mati.
  const selectedEvent = events.find((ev) => ev.id === selectedEventId) || null

  // Gate edit/pindah stok (Storefront Roadmap #2) — cermin backend isStockEditAllowed:
  // hanya boleh setelah storefront disetujui admin (fee ikut diatur saat approval).
  const canEditStock = event?.storefrontStatus === "approved"

  const storefrontUrl = event?.slug ? `nexeventapp.tech/event/${event.slug}` : ""
  const copyUrl = () => {
    navigator.clipboard.writeText(`https://${storefrontUrl}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
      </div>
    )
  }

  // Redirect sedang berjalan — jangan render konten halaman.
  if (!selectedEventId) return null

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* Kembali ke pintu utama kategori Tiket & Pencairan (event dipertahankan) */}
      <div>
        <Link
          href={`/dashboard/ticketing?eventId=${selectedEventId}`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Dashboard Ticketing
        </Link>
      </div>

      <div className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
          <TicketIcon className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Manajemen Tiket</h1>
          <p className="mt-0.5 text-sm text-slate-500">Jual tiket event langsung ke penonton lewat storefront publik nexEvent.</p>
        </div>
      </div>

      {/* Event aktif — dipilih di Dashboard Tiket & Pencairan, bukan di sini (dropdown dihapus).
          Tombol "Data Audience" per-event dipindah ke Dashboard Ticketing (hub), 2026-07-17. */}
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700">Event</p>
        <p className="text-sm font-semibold text-slate-900">{selectedEvent?.title ?? "Memuat event..."}</p>
      </div>

      {selectedEventId && loadingDetail && !event && (
        <div className="flex justify-center py-14">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
        </div>
      )}

      {selectedEventId && event && (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {/* Desktop: 2 kolom seimbang — kiri "katalog jualan", kanan "storefront & pesanan".
              Di bawah lg semua tetap menumpuk vertikal dengan urutan DOM yang sama seperti sebelumnya. */}
          {/* Kolom kiri: katalog yang dijual (tiket, merch, bundling) */}
          <div className="flex flex-col gap-6">
            {/* Ticket types */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-slate-900">Jenis Tiket</p>

              {ticketTypes.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Belum ada jenis tiket.</p>
              ) : (
                <ul className="mb-4 flex flex-col gap-2">
                  {ticketTypes.map((tt) => (
                    <li key={tt.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      {editingId === tt.id ? (
                        <div className="flex flex-col gap-2">
                          <input
                            value={editDraft.name}
                            onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                          />
                          <div className="flex gap-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={editDraft.price}
                              onChange={(e) => setEditDraft((d) => ({ ...d, price: formatIDRInput(e.target.value) }))}
                              placeholder="Harga"
                              className="w-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                            />
                            <input
                              type="number"
                              value={editDraft.quota}
                              onChange={(e) => setEditDraft((d) => ({ ...d, quota: e.target.value }))}
                              placeholder="Kuota"
                              disabled={!canEditStock}
                              title={canEditStock ? "Kuota" : "Kuota (stok) bisa diubah setelah storefront disetujui admin"}
                              className="w-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </div>
                          {!canEditStock && (
                            <p className="text-[11px] text-slate-400">Kuota terkunci sampai storefront disetujui admin. Nama &amp; harga tetap bisa diubah.</p>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => saveEdit(tt.id)} className="flex-1 rounded-lg bg-emerald-800 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900">Simpan</button>
                            <button onClick={() => setEditingId(null)} className="flex-1 rounded-lg bg-slate-200 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300">Batal</button>
                          </div>
                        </div>
                      ) : transferSourceId === tt.id ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs font-semibold text-slate-700">Pindah Stok dari &quot;{tt.name}&quot;</p>
                          <p className="text-[11px] text-slate-400">Tersedia dipindah: {tt.quota - tt.sold} (kuota {tt.quota} − terjual {tt.sold})</p>
                          <select
                            value={transferDest}
                            onChange={(e) => setTransferDest(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500"
                          >
                            <option value="">-- Pilih tiket tujuan --</option>
                            {ticketTypes.filter((t) => t.id !== tt.id).map((t) => (
                              <option key={t.id} value={t.id}>{t.name} (kuota {t.quota})</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={1}
                            value={transferQty}
                            onChange={(e) => setTransferQty(e.target.value)}
                            placeholder="Jumlah stok yang dipindah"
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500"
                          />
                          {transferDest && Number(transferQty) > 0 && (
                            <p className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] text-slate-600">
                              {tt.name}: {tt.quota} → {tt.quota - Number(transferQty)}
                              {" · "}
                              {ticketTypes.find((t) => t.id === transferDest)?.name}: {ticketTypes.find((t) => t.id === transferDest)?.quota} → {(ticketTypes.find((t) => t.id === transferDest)?.quota ?? 0) + Number(transferQty)}
                            </p>
                          )}
                          {transferError && <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-600">{transferError}</p>}
                          <div className="flex gap-2">
                            <button onClick={() => handleTransferStock(tt.id)} disabled={transferring} className="flex-1 rounded-lg bg-emerald-800 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">{transferring ? "Memindah..." : "Pindahkan"}</button>
                            <button onClick={() => { setTransferSourceId(null); setTransferError("") }} className="flex-1 rounded-lg bg-slate-200 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300">Batal</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">{tt.name}</p>
                              {!tt.isActive && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">Nonaktif</span>}
                              <FeeStatusBadge feePercent={tt.feePercent} />
                            </div>
                            <p className="text-xs text-slate-500">{IDR.format(tt.price)} · {tt.sold}/{tt.quota} terjual</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <div className="flex items-center gap-1.5">
                              <ToggleSwitch checked={tt.isActive} onChange={() => toggleActive(tt)} />
                              <span className={`text-[11px] font-medium ${tt.isActive ? "text-emerald-700" : "text-slate-400"}`}>
                                {tt.isActive ? "Aktif" : "Nonaktif"}
                              </span>
                            </div>
                            {canEditStock && ticketTypes.length > 1 && (
                              <button onClick={() => startTransfer(tt)} title="Pindah stok ke jenis tiket lain" className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-700">
                                <ArrowLeftRight className="size-3.5" />
                              </button>
                            )}
                            <button onClick={() => startEdit(tt)} className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                              <Pencil className="size-3.5" />
                            </button>
                            <button onClick={() => deleteType(tt.id)} className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500">
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={handleAddType} className="flex flex-col gap-2 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium text-slate-500">Tambah Jenis Tiket</p>
                <input
                  value={newType.name}
                  onChange={(e) => setNewType((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Nama (Regular, VIP, ...)"
                  required
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
                <input
                  value={newType.description}
                  onChange={(e) => setNewType((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Deskripsi (opsional)"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
                <div className="flex gap-2">
                  <div className="relative w-1/2">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={newType.price}
                      onChange={(e) => setNewType((d) => ({ ...d, price: formatIDRInput(e.target.value) }))}
                      placeholder="Harga"
                      required
                      className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                    />
                  </div>
                  <input
                    type="number"
                    value={newType.quota}
                    onChange={(e) => setNewType((d) => ({ ...d, quota: e.target.value }))}
                    placeholder="Kuota"
                    required
                    min={1}
                    className="w-1/2 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                </div>
                {typeError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{typeError}</p>}
                <button
                  type="submit"
                  disabled={addingType}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-800 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                >
                  <Plus className="size-4" /> {addingType ? "Menambahkan..." : "Tambah Jenis Tiket"}
                </button>
              </form>
            </div>

            {/* Merchandise */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-900">Merchandise</p>
                <p className="mt-0.5 text-xs text-slate-400">Tambah produk yang dijual di storefront (opsional).</p>
              </div>

              {merchItems.length > 0 && (
                <ul className="mb-4 flex flex-col gap-3">
                  {merchItems.map((item) => (
                    <li key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-start gap-3">
                        {/* Product image */}
                        <div className="size-16 shrink-0 overflow-hidden rounded-xl border border-slate-200">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="size-full object-cover" />
                          ) : (
                            <label className="flex size-full cursor-pointer flex-col items-center justify-center bg-white hover:bg-slate-50">
                              <Upload className="size-4 text-slate-300" />
                              <span className="mt-1 text-[9px] text-slate-300">{uploadingMerchId === item.id ? "..." : "Foto"}</span>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                disabled={uploadingMerchId === item.id}
                                onChange={(e) => handleUploadMerchImage(item.id, e.target.files?.[0])}
                              />
                            </label>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-bold text-slate-900">{item.name}</p>
                            <div className="flex shrink-0 items-center gap-2">
                              <FeeStatusBadge feePercent={item.feePercent} />
                              <ToggleSwitch checked={item.isActive} onChange={() => handleToggleMerchActive(item.id, !item.isActive)} />
                              <button onClick={() => handleDeleteMerch(item.id)} className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500">
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm font-bold text-emerald-700">{IDR.format(item.price)}</p>
                          <div className="mt-1">
                            {item.approvalStatus === "pending" && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                                Menunggu Persetujuan
                              </span>
                            )}
                            {item.approvalStatus === "approved" && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                                Disetujui
                              </span>
                            )}
                            {item.approvalStatus === "rejected" && (
                              <div>
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                                  Ditolak
                                </span>
                                {item.approvalNote && (
                                  <p className="mt-1 text-xs text-red-500">Catatan: {item.approvalNote}</p>
                                )}
                              </div>
                            )}
                          </div>
                          {item.imageUrl && (
                            <label className="mt-0.5 inline-block cursor-pointer text-[11px] text-emerald-600 hover:underline">
                              {uploadingMerchId === item.id ? "Mengupload..." : "Ganti foto"}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                disabled={uploadingMerchId === item.id}
                                onChange={(e) => handleUploadMerchImage(item.id, e.target.files?.[0])}
                              />
                            </label>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.variants.map((v) => (
                              <span
                                key={v.id}
                                className={`rounded-lg border px-2 py-1 text-[11px] ${
                                  v.sold >= v.stock
                                    ? "border-red-200 bg-red-50 text-red-500"
                                    : "border-slate-200 bg-white text-slate-600"
                                }`}
                              >
                                {v.size} <span className="text-slate-400">({v.stock - v.sold} sisa)</span>
                              </span>
                            ))}
                          </div>

                          {/* Edit stok per size — Storefront Roadmap #2 (gated: storefront approved + fee diatur admin) */}
                          {canEditStock ? (
                            <div className="mt-2 border-t border-slate-100 pt-2">
                              <p className="mb-1.5 text-[11px] font-medium text-slate-500">Edit Stok</p>
                              <div className="flex flex-col gap-1.5">
                                {item.variants.map((v) => (
                                  <div key={v.id} className="flex items-center gap-2">
                                    <span className="w-16 shrink-0 text-xs font-semibold text-slate-600">{v.size}</span>
                                    {editingVariantId === v.id ? (
                                      <>
                                        <input
                                          type="number"
                                          min={v.sold}
                                          value={variantStockDraft}
                                          onChange={(e) => setVariantStockDraft(e.target.value)}
                                          className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-emerald-500"
                                        />
                                        <span className="text-[11px] text-slate-400">pcs</span>
                                        <button onClick={() => saveVariantStock(v.id, item.id)} className="ml-auto rounded-lg bg-emerald-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-900">Simpan</button>
                                        <button onClick={() => { setEditingVariantId(null); setVariantStockError("") }} className="rounded-lg bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-300">Batal</button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-xs text-slate-500">{v.stock} pcs <span className="text-slate-400">({v.sold} terjual)</span></span>
                                        <button onClick={() => startEditVariant(v)} className="ml-auto flex size-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                                          <Pencil className="size-3" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                              {variantStockError && editingVariantId && (
                                <p className="mt-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-600">{variantStockError}</p>
                              )}
                            </div>
                          ) : (
                            <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                              Edit stok tersedia setelah storefront disetujui admin.
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add new merch */}
              <div className="rounded-lg border-2 border-dashed border-slate-200 p-4">
                <p className="mb-3 text-xs font-medium text-slate-500">Tambah Produk Merchandise</p>
                <div className="flex flex-col gap-2">
                  <input
                    value={newMerchName}
                    onChange={(e) => setNewMerchName(e.target.value)}
                    placeholder="Nama produk (contoh: Kaos Malekolo Fest)"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                  <input
                    value={newMerchDescription}
                    onChange={(e) => setNewMerchDescription(e.target.value)}
                    placeholder="Deskripsi (opsional)"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={newMerchPrice}
                      onChange={(e) => setNewMerchPrice(formatIDRInput(e.target.value))}
                      placeholder="Harga — sama untuk semua size"
                      className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-500">Size &amp; Stok</p>
                    <div className="grid grid-cols-2 gap-2">
                      {MERCH_SIZES.map((size) => (
                        <div key={size} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                          <span className="w-14 shrink-0 text-xs font-bold text-slate-600">{size}</span>
                          <input
                            type="number"
                            min={0}
                            value={newMerchVariants[size] ?? ""}
                            onChange={(e) => setNewMerchVariants((prev) => ({ ...prev, [size]: parseInt(e.target.value) || 0 }))}
                            placeholder="0"
                            className="w-full min-w-0 border-0 bg-transparent text-center text-sm outline-none"
                          />
                          <span className="shrink-0 text-xs text-slate-400">pcs</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">Kosongkan atau isi 0 jika size tidak tersedia.</p>
                  </div>
                  {merchError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{merchError}</p>}
                  <button
                    onClick={handleAddMerch}
                    disabled={addingMerch}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-800 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                  >
                    <Plus className="size-4" /> {addingMerch ? "Menambahkan..." : "Tambah Merchandise"}
                  </button>
                  <p className="text-xs text-slate-400">
                    Merchandise baru akan direview admin sebelum tampil di storefront.
                  </p>
                </div>
              </div>
            </div>

            {/* Paket Bundling */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Package className="size-4 text-emerald-700" /> Paket Bundling
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Paket kurasi tiket + merch dengan harga khusus (contoh: Tiket VIP + Kaos = Rp 200.000).
                </p>
              </div>

              {bundles.length > 0 && (
                <ul className="mb-4 flex flex-col gap-3">
                  {bundles.map((b) => (
                    <li key={b.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-start gap-3">
                        <div className="size-16 shrink-0 overflow-hidden rounded-xl border border-slate-200">
                          {b.imageUrl ? (
                            <img src={b.imageUrl} alt={b.name} className="size-full object-cover" />
                          ) : (
                            <label className="flex size-full cursor-pointer flex-col items-center justify-center bg-white hover:bg-slate-50">
                              <Upload className="size-4 text-slate-300" />
                              <span className="mt-1 text-[9px] text-slate-300">{uploadingBundleId === b.id ? "..." : "Foto"}</span>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                disabled={uploadingBundleId === b.id}
                                onChange={(e) => handleUploadBundleImage(b.id, e.target.files?.[0])}
                              />
                            </label>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-bold text-slate-900">{b.name}</p>
                            <div className="flex shrink-0 items-center gap-2">
                              <FeeStatusBadge feePercent={b.feePercent} />
                              <ToggleSwitch checked={b.isActive} onChange={() => handleToggleBundleActive(b.id, !b.isActive)} />
                              <button onClick={() => handleDeleteBundle(b.id)} className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-500">
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm font-bold text-emerald-700">{IDR.format(b.price)}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Isi: {b.items.map((it) => `${it.quantity}× ${it.label}`).join(" + ")}
                          </p>
                          <div className="mt-1">
                            {b.approvalStatus === "pending" && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Menunggu Persetujuan</span>
                            )}
                            {b.approvalStatus === "approved" && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">Disetujui</span>
                            )}
                            {b.approvalStatus === "rejected" && (
                              <div>
                                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">Ditolak</span>
                                {b.approvalNote && <p className="mt-1 text-xs text-red-500">Catatan: {b.approvalNote}</p>}
                              </div>
                            )}
                          </div>
                          {b.imageUrl && (
                            <label className="mt-0.5 inline-block cursor-pointer text-[11px] text-emerald-600 hover:underline">
                              {uploadingBundleId === b.id ? "Mengupload..." : "Ganti foto"}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                disabled={uploadingBundleId === b.id}
                                onChange={(e) => handleUploadBundleImage(b.id, e.target.files?.[0])}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Add new bundle */}
              <div className="rounded-lg border-2 border-dashed border-slate-200 p-4">
                <p className="mb-3 text-xs font-medium text-slate-500">Buat Paket Bundling</p>
                <div className="flex flex-col gap-2">
                  <input
                    value={newBundleName}
                    onChange={(e) => setNewBundleName(e.target.value)}
                    placeholder="Nama paket (contoh: Paket VIP Spesial)"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                  <input
                    value={newBundleDescription}
                    onChange={(e) => setNewBundleDescription(e.target.value)}
                    placeholder="Deskripsi (opsional)"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={newBundlePrice}
                      onChange={(e) => setNewBundlePrice(formatIDRInput(e.target.value))}
                      placeholder="Harga total paket"
                      className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                    />
                  </div>

                  {/* Item selector */}
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 text-xs font-medium text-slate-500">Tambah Item ke Paket</p>
                    <div className="mb-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelItemType("ticket")}
                        className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${selItemType === "ticket" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}
                      >
                        Tiket
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelItemType("merch")}
                        className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${selItemType === "merch" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}
                      >
                        Merchandise
                      </button>
                    </div>
                    <div className="flex gap-2">
                      {selItemType === "ticket" ? (
                        <select
                          value={selTicketTypeId}
                          onChange={(e) => setSelTicketTypeId(e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Pilih tiket --</option>
                          {ticketTypes.map((tt) => (
                            <option key={tt.id} value={tt.id}>{tt.name}</option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={selMerchItemId}
                          onChange={(e) => setSelMerchItemId(e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Pilih merch --</option>
                          {merchItems.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      )}
                      <input
                        type="number"
                        min={1}
                        value={selItemQty}
                        onChange={(e) => setSelItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={addItemToBundleDraft}
                        className="shrink-0 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
                      >
                        Tambah
                      </button>
                    </div>

                    {selItemType === "merch" && (
                      <p className="mt-1 text-xs text-slate-400">Size akan dipilih oleh pembeli saat checkout.</p>
                    )}

                    {bundleDraftItems.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {bundleDraftItems.map((it, idx) => (
                          <li key={idx} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                            <span>{it.quantity}× {it.label} <span className="text-slate-400">({it.itemType === "ticket" ? "tiket" : "merch"})</span></span>
                            <button type="button" onClick={() => removeBundleDraftItem(idx)} className="text-red-400 hover:text-red-500">Hapus</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {bundleError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{bundleError}</p>}
                  <button
                    onClick={handleAddBundle}
                    disabled={addingBundle}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-800 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                  >
                    <Plus className="size-4" /> {addingBundle ? "Membuat..." : "Buat Paket"}
                  </button>
                  <p className="text-xs text-slate-400">
                    Stok paket mengambil dari stok tiket &amp; merch. Paket akan direview admin sebelum tampil di storefront.
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* Kolom kanan: etalase + operasional + data live (pesanan) */}
          <div className="flex flex-col gap-6">
            {/* Banner + Logo upload */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-slate-900">Tampilan Storefront</p>

              <div className="mb-5">
                <p className="mb-1 text-sm font-bold text-slate-700">Banner Event</p>
                <p className="mb-2 text-xs text-slate-400">
                  Tampil sebagai hero image di halaman tiket publik. Rekomendasi: 1200×400px, maks 5MB.
                </p>
                {event.bannerUrl ? (
                  <div className="relative">
                    <img src={event.bannerUrl} alt="Banner" className="h-32 w-full rounded-xl border border-slate-200 object-cover" />
                    <button
                      onClick={() => handleUploadBanner(null)}
                      className="absolute right-2 top-2 rounded-lg bg-red-500 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600"
                    >
                      Hapus
                    </button>
                  </div>
                ) : (
                  <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 hover:bg-slate-50">
                    <Upload className="mb-1 size-6 text-slate-400" />
                    <span className="text-xs text-slate-400">{uploadingBanner ? "Mengupload..." : "Klik untuk upload banner"}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploadingBanner}
                      onChange={(e) => handleUploadBanner(e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-bold text-slate-700">Logo Event</p>
                {event.logoUrl ? (
                  <div className="flex items-center gap-3">
                    <img src={event.logoUrl} alt="Logo" className="size-16 rounded-xl border border-slate-200 object-cover" />
                    <button onClick={() => handleUploadLogo(null)} className="text-xs font-medium text-red-500 hover:text-red-600">
                      Hapus
                    </button>
                  </div>
                ) : (
                  <label className="flex size-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 hover:bg-slate-50">
                    <Upload className="mb-1 size-5 text-slate-400" />
                    <span className="text-center text-[10px] text-slate-400">{uploadingLogo ? "Mengupload..." : "Upload logo"}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploadingLogo}
                      onChange={(e) => handleUploadLogo(e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>

              {uploadError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{uploadError}</p>}
            </div>

            {/* Informasi Storefront */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-slate-900">Informasi Storefront</p>

              {/* About This Event */}
              <div className="mb-6">
                <label className="mb-2 block text-sm font-bold text-slate-700">Tentang Event Ini</label>
                <p className="mb-2 text-xs text-slate-400">
                  Jelaskan event kamu — lineup artis, rundown, dress code, dll. Tampil di halaman tiket publik.
                </p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contoh: Malekolo Fest 2026 menghadirkan 10 artis indie terbaik Indonesia dalam satu malam penuh energi di GWK Bali..."
                  rows={5}
                  className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Fasilitas Venue */}
              <div className="mb-6">
                <label className="mb-2 block text-sm font-bold text-slate-700">Fasilitas yang Tersedia</label>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {DEFAULT_FACILITIES.map((facility) => (
                    <label
                      key={facility.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFacilities.some((f) => f.id === facility.id)}
                        onChange={() => toggleFacility(facility)}
                        className="size-4 accent-emerald-600"
                      />
                      <span className="text-sm text-slate-700">{facility.name}</span>
                    </label>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customFacility}
                    onChange={(e) => setCustomFacility(e.target.value)}
                    placeholder="Tambah fasilitas lain..."
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomFacility())}
                  />
                  <button
                    type="button"
                    onClick={addCustomFacility}
                    className="rounded-xl bg-emerald-800 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-900"
                  >
                    + Tambah
                  </button>
                </div>

                {selectedFacilities.filter((f) => f.isCustom).map((f) => (
                  <div key={f.id} className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                    <span className="text-sm text-emerald-800">{f.name}</span>
                    <button type="button" onClick={() => removeFacility(f.id)} className="text-xs text-red-400 hover:text-red-500">
                      Hapus
                    </button>
                  </div>
                ))}
              </div>

              {/* Terms & Conditions */}
              <div className="mb-2">
                <label className="mb-2 block text-sm font-bold text-slate-700">Syarat &amp; Ketentuan Event</label>
                <p className="mb-2 text-xs text-slate-400">
                  Tampil di halaman tiket publik. Edit sesuai kebutuhan event kamu.
                </p>
                <button
                  type="button"
                  onClick={() => setTermsConditions(DEFAULT_TERMS_TEMPLATE)}
                  className="mb-2 block text-xs text-emerald-600 underline"
                >
                  Gunakan template default
                </button>
                <textarea
                  value={termsConditions}
                  onChange={(e) => setTermsConditions(e.target.value)}
                  placeholder="Isi syarat dan ketentuan event kamu..."
                  rows={8}
                  className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="button"
                onClick={saveEventInfo}
                disabled={savingInfo}
                className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
              >
                {savingInfo ? "Menyimpan..." : infoSaved ? "Tersimpan ✓" : "Simpan Informasi"}
              </button>
            </div>

            {/* Storefront settings */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Pengaturan Storefront</p>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_LABEL[event.storefrontStatus].className}`}>
                  {STATUS_LABEL[event.storefrontStatus].label}
                </span>
              </div>

              {event.storefrontStatus === "rejected" && event.storefrontNote && (
                <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  <span className="font-semibold">Catatan admin:</span> {event.storefrontNote}
                </div>
              )}

              {event.storefrontStatus === "approved" && event.slug ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="mb-1 text-sm font-bold text-emerald-800">✅ Storefront Aktif</p>
                  <p className="mb-2 text-xs text-emerald-600">Bagikan link ini ke calon penonton:</p>
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white p-2">
                    <ExternalLink className="size-4 shrink-0 text-emerald-700" />
                    <a href={`https://${storefrontUrl}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-slate-700 hover:underline">
                      {storefrontUrl}
                    </a>
                    <button
                      onClick={copyUrl}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-800 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-900"
                    >
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied ? "Tersalin" : "Salin"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-emerald-600">
                    Biaya layanan: {event.platformFeePercent}% · Ditanggung {event.feeBearer === "audience" ? "penonton" : "promotor"}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Fee bearer selection — WAJIB DIISI */}
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="mb-1 text-sm font-bold text-slate-700">
                      Siapa yang menanggung biaya layanan platform?
                    </p>
                    <p className="mb-3 text-xs text-slate-400">
                      Wajib dipilih sebelum mengajukan persetujuan. Biaya layanan: {event.platformFeePercent || 3.5}% per transaksi.
                    </p>

                    <div className="flex flex-col gap-2">
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                        <input
                          type="radio"
                          name="feeBearer"
                          value="audience"
                          checked={event.feeBearer === "audience"}
                          disabled={savingFeeBearer}
                          onChange={() => handleSetFeeBearer("audience")}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-800">Penonton yang bayar</p>
                          <p className="text-xs text-slate-400">Harga tiket + biaya layanan ditampilkan transparan di checkout</p>
                          <p className="mt-1 text-xs font-medium text-emerald-600">
                            Contoh: Tiket Rp 50.000 → Penonton bayar Rp {(50000 + Math.round(50000 * ((event.platformFeePercent || 3.5) / 100))).toLocaleString("id-ID")}
                          </p>
                        </div>
                      </label>

                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                        <input
                          type="radio"
                          name="feeBearer"
                          value="promotor"
                          checked={event.feeBearer === "promotor"}
                          disabled={savingFeeBearer}
                          onChange={() => handleSetFeeBearer("promotor")}
                          className="mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-800">Promotor yang bayar</p>
                          <p className="text-xs text-slate-400">Penonton bayar harga bersih, biaya layanan dipotong dari hasil penjualan</p>
                          <p className="mt-1 text-xs font-medium text-amber-600">
                            Contoh: Tiket Rp 50.000 → Anda menerima Rp {(50000 - Math.round(50000 * ((event.platformFeePercent || 3.5) / 100))).toLocaleString("id-ID")}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Tax toggle */}
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">Aktifkan Pajak 10%</p>
                      <p className="text-xs text-slate-400">Pajak ditanggung penonton, ditambahkan ke total</p>
                    </div>
                    <ToggleSwitch checked={event.taxEnabled} onChange={handleToggleTax} disabled={savingTax} />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Mulai Jual Tiket</label>
                    <input
                      type="datetime-local"
                      value={saleStart}
                      onChange={(e) => setSaleStart(e.target.value)}
                      disabled={event.storefrontStatus === "pending_approval"}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Selesai Jual Tiket</label>
                    <input
                      type="datetime-local"
                      value={saleEnd}
                      onChange={(e) => setSaleEnd(e.target.value)}
                      disabled={event.storefrontStatus === "pending_approval"}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  {!event.feeBearer && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Pilih siapa yang menanggung biaya layanan di atas sebelum mengajukan persetujuan.
                    </p>
                  )}
                  {approvalError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{approvalError}</p>}
                  {event.storefrontStatus === "pending_approval" ? (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Menunggu review admin nexEvent.</p>
                  ) : (
                    <button
                      onClick={requestApproval}
                      disabled={submittingApproval || !event.feeBearer}
                      className="rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                    >
                      {submittingApproval ? "Mengajukan..." : "Ajukan Persetujuan"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Ticket Box Offline — QR untuk jual tiket cash/transfer di lokasi */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-1 text-sm font-semibold text-slate-900">Ticket Box Offline</p>
              <p className="mb-4 text-xs text-slate-500">
                Tampilkan/cetak QR ini di pintu masuk. Panitia scan → pembeli isi data & pilih bayar cash/transfer di HP masing-masing.
              </p>

              {!ticketBoxQr ? (
                <button
                  onClick={() => handleGenerateTicketBoxQR()}
                  disabled={generatingBoxQr || !selectedEventId}
                  className="rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
                >
                  {generatingBoxQr ? "Membuat..." : "Generate QR Ticket Box"}
                </button>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ticketBoxQr} alt="QR Ticket Box Offline" className="size-48 rounded-lg bg-white p-2" />
                  <p className="break-all text-center text-xs font-mono text-slate-600">{ticketBoxUrl}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(ticketBoxUrl)
                        setBoxCopied(true)
                        setTimeout(() => setBoxCopied(false), 1500)
                      }}
                      className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      {boxCopied ? "Tersalin!" : "Salin Link"}
                    </button>
                    <a
                      href={ticketBoxQr}
                      download={`ticket-box-${selectedEventId}.png`}
                      className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900"
                    >
                      Unduh QR
                    </a>
                    <button
                      onClick={() => handleGenerateTicketBoxQR(true)}
                      disabled={generatingBoxQr}
                      title="Terbitkan token keamanan baru — QR/link lama langsung tidak berlaku"
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {generatingBoxQr ? "Membuat..." : "Buat Ulang (Token Baru)"}
                    </button>
                  </div>
                  <p className="text-center text-[11px] text-slate-500">
                    Link QR memuat token keamanan — hanya QR/link resmi ini yang bisa dipakai membeli.
                    Curiga bocor? Klik &ldquo;Buat Ulang (Token Baru)&rdquo;.
                  </p>
                </div>
              )}

              {ticketBoxError && (
                <p className="mt-2 text-xs text-red-600">{ticketBoxError}</p>
              )}
            </div>

            {/* Pesanan — tetap paling akhir supaya daftar yang panjang tidak mendorong seksi lain */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-slate-900">Pesanan ({orders.length})</p>
              {orders.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Belum ada pesanan.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {orders.map((o) => (
                    <li key={o.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{o.buyerName}</p>
                          <p className="truncate text-xs text-slate-500">{o.buyerEmail}</p>
                          {o.items.length > 0 && (
                            <p className="mt-1 text-xs text-slate-400">
                              {o.items.map((i) => `${i.ticketType.name}×${i.quantity}`).join(", ")}
                            </p>
                          )}
                          {o.merchItems && o.merchItems.length > 0 && (
                            <p className="mt-0.5 text-xs text-slate-400">
                              🛍 {o.merchItems.map((m) => `${m.item.name} (${m.variant.size})×${m.quantity}`).join(", ")}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-slate-900">{IDR.format(o.totalAmount)}</p>
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${ORDER_STATUS_BADGE[o.status] || "bg-slate-100 text-slate-500"}`}>
                            {o.status}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        {new Date(o.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
