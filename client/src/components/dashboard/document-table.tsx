"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import Link from "next/link"
import { CalendarRange, Download, FileText, MessageCircle, RotateCw, Trash2 } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EventPurchaseOrderList } from "@/components/dashboard/EventPurchaseOrderList"

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "-"
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  }).format(new Date(dateStr))
}

interface Event {
  id: number
  title: string
  location: string
  event_date: string
  target_profit: number | string
}

interface InvoiceData {
  id: string
  invoiceNumber: string
  dealId: string
  sponsorName: string
  contactName: string
  grandTotal: number
  status: string
  currentTier: string
  createdAt: string
  pdfUrl: string | null
}

interface DealData {
  id: string
  eventId: string | null
}

interface InvoiceEventInfo {
  invoiceId: string
  invoiceNumber: string
  invoiceDate: string
  invoiceStatus: string
  grandTotal: number
}

type Filter = "Semua" | "Invoice" | "RAB" | "PO"

function invoiceStatusBadge(status: string) {
  if (status === "Lunas")
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "DP Terbayar")
    return "border-blue-200 bg-blue-50 text-blue-700"
  return "border-amber-200 bg-amber-50 text-amber-700"
}

export function DocumentTable() {
  const [filter, setFilter] = useState<Filter>("Semua")
  const [events, setEvents] = useState<Event[]>([])
  const [allInvoices, setAllInvoices] = useState<InvoiceData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [invoicesByEventId, setInvoicesByEventId] = useState<Map<string, InvoiceEventInfo>>(new Map())

  const fetchData = () => {
    const token = localStorage.getItem("token")
    const headers = { Authorization: `Bearer ${token}` }

    Promise.all([
      axios.get(`/api/events`, { headers }),
      axios.get(`/api/invoices`, { headers }).catch(() => ({ data: { data: [] } })),
      axios.get(`/api/sponsor/deals`, { headers }).catch(() => ({ data: { data: [] } })),
    ])
      .then(([eventsRes, invoicesRes, dealsRes]) => {
        const eventList: Event[] = Array.isArray(eventsRes.data) ? eventsRes.data : eventsRes.data.data ?? []
        const invoiceList: InvoiceData[] = invoicesRes.data?.data ?? []
        const dealList: DealData[] = dealsRes.data?.data ?? []

        setEvents(eventList)
        setAllInvoices(invoiceList)

        // Build event → invoice mapping via deals (works when deal.eventId is set)
        const map = new Map<string, InvoiceEventInfo>()
        for (const deal of dealList) {
          if (!deal.eventId) continue
          const invoice = invoiceList.find((i) => i.dealId === deal.id)
          if (invoice) {
            map.set(String(deal.eventId), {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              invoiceDate: invoice.createdAt,
              invoiceStatus: invoice.status,
              grandTotal: Number(invoice.grandTotal),
            })
          }
        }
        setInvoicesByEventId(map)
      })
      .catch((err) => console.error("Gagal mengambil data", err))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredEvents = filter === "RAB" ? events : events

  const colSpan = filter === "Invoice" ? 8 : 6

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Tabel Dokumen Event</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Pantau status perancangan anggaran dan kelola dokumen RAB untuk setiap event.
          </p>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="bg-slate-100">
            <TabsTrigger value="Semua">Semua</TabsTrigger>
            <TabsTrigger value="Invoice">Invoice</TabsTrigger>
            <TabsTrigger value="RAB">RAB</TabsTrigger>
            <TabsTrigger value="PO">Purchase Order</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="overflow-x-auto">
        {filter === "PO" ? (
          <EventPurchaseOrderList />
        ) : null}
        {filter !== "PO" && <Table>
          <TableHeader>
            <TableRow className="border-slate-200 hover:bg-transparent">
              <TableHead className="py-3.5 pl-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Dokumen
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {filter === "Invoice" ? "Sponsor / Klien" : "Event & Lokasi"}
              </TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {filter === "Invoice" ? "Tanggal Invoice" : "Tanggal Event"}
              </TableHead>
              {filter === "Invoice" ? (
                <>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Nomor Invoice
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Nilai
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Status Bayar
                  </TableHead>
                </>
              ) : (
                <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Nilai RAB
                </TableHead>
              )}
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Status
              </TableHead>
              <TableHead className="pr-5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Aksi
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-12 text-center text-sm text-slate-500">
                  <RotateCw className="mx-auto mb-2 size-4 animate-spin text-slate-400" />
                  Memuat data...
                </TableCell>
              </TableRow>
            ) : filter === "Invoice" ? (
              /* ── Tab Invoice: tampilkan langsung semua invoice ── */
              allInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <FileText className="size-10 text-slate-200" />
                      <p className="text-sm text-slate-500">Belum ada invoice yang dibuat.</p>
                      <Link href="/dashboard/invoice">
                        <Button size="sm" className="h-8 bg-emerald-800 text-white hover:bg-emerald-900">
                          Buat Invoice
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                allInvoices.map((invoice) => (
                  <InvoiceDirectRow
                    key={invoice.id}
                    invoice={invoice}
                    onRefresh={fetchData}
                  />
                ))
              )
            ) : (
              /* ── Tab Semua / RAB: tampilkan rows event ── */
              events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm text-slate-500">Belum ada event. Silakan buat Event pertama Anda.</p>
                      <Link href="/dashboard/create-event">
                        <Button className="h-9 bg-emerald-800 text-white hover:bg-emerald-900">Buat Event</Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((event) => (
                  <EventTableRow
                    key={event.id}
                    event={event}
                    invoiceInfo={invoicesByEventId.get(String(event.id)) ?? null}
                    onDeleteSuccess={fetchData}
                  />
                ))
              )
            )}
          </TableBody>
        </Table>}
      </div>
    </section>
  )
}

// ── InvoiceDirectRow: baris invoice langsung (tidak tergantung event) ───────────

function InvoiceDirectRow({
  invoice,
  onRefresh,
}: {
  invoice: InvoiceData
  onRefresh: () => void
}) {
  const [downloading, setDownloading] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(invoice.status)

  async function downloadPdf() {
    if (!invoice.pdfUrl) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/pdf?path=${encodeURIComponent(invoice.pdfUrl)}`)
      if (!res.ok) throw new Error("Gagal")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${invoice.invoiceNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert("Gagal mengunduh PDF. Pastikan server berjalan.")
    }
    setDownloading(false)
  }

  function shareWhatsApp() {
    const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })
    const text = `Halo, berikut invoice sponsorship kami:\n\n*${invoice.invoiceNumber}*\nSponsor: ${invoice.sponsorName}\nTotal: ${IDR.format(Number(invoice.grandTotal))}\n\nTerima kasih atas dukungan Anda!`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank")
  }

  async function handleStatusChange(newStatus: string) {
    if (newStatus === currentStatus) return
    const prev = currentStatus
    setCurrentStatus(newStatus)
    setUpdatingStatus(true)
    try {
      const token = localStorage.getItem("token")
      const res = await fetch(`/api/invoices/${invoice.id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
    } catch {
      setCurrentStatus(prev)
      alert("Gagal update status. Coba lagi.")
    } finally {
      setUpdatingStatus(false)
    }
  }

  return (
    <TableRow className="border-slate-200 transition-colors hover:bg-slate-50">
      {/* Dokumen */}
      <TableCell className="py-4 pl-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-emerald-800">
            <FileText className="size-4" />
          </div>
          <div className="leading-tight">
            <p className="font-mono text-sm font-medium text-slate-900">{invoice.invoiceNumber}</p>
            <span className="text-xs text-slate-500">Invoice</span>
          </div>
        </div>
      </TableCell>

      {/* Sponsor / Klien */}
      <TableCell>
        <p className="max-w-52 truncate font-medium text-slate-900">{invoice.sponsorName}</p>
        <p className="max-w-52 truncate text-xs text-slate-500">{invoice.contactName || "Sponsor Deal"}</p>
      </TableCell>

      {/* Tanggal Invoice */}
      <TableCell>
        <p className="text-sm text-slate-900">{formatDate(invoice.createdAt)}</p>
      </TableCell>

      {/* Nomor Invoice */}
      <TableCell>
        <span className="font-mono text-sm font-semibold text-slate-900">{invoice.invoiceNumber}</span>
      </TableCell>

      {/* Nilai */}
      <TableCell className="text-right">
        <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
          {formatCurrency(Number(invoice.grandTotal))}
        </span>
      </TableCell>

      {/* Status Bayar — dropdown */}
      <TableCell>
        <div className="flex items-center gap-1.5">
          <select
            value={currentStatus}
            disabled={updatingStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className={`rounded-lg border px-2 py-1 text-xs outline-none cursor-pointer ${invoiceStatusBadge(currentStatus)}`}
          >
            <option value="Belum Dibayar">Belum Dibayar</option>
            <option value="DP Terbayar">DP Terbayar</option>
            <option value="Lunas">Lunas</option>
          </select>
          {updatingStatus && <RotateCw className="size-3 animate-spin text-slate-400" />}
        </div>
      </TableCell>

      {/* Status badge */}
      <TableCell>
        <Badge
          variant="outline"
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${invoiceStatusBadge(currentStatus)}`}
        >
          {currentStatus}
        </Badge>
      </TableCell>

      {/* Aksi */}
      <TableCell className="pr-5">
        <div className="flex items-center justify-end gap-1.5">
          {invoice.pdfUrl && (
            <>
              <button
                onClick={downloadPdf}
                disabled={downloading}
                title="Unduh PDF"
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {downloading ? <RotateCw className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                PDF
              </button>
              <button
                onClick={shareWhatsApp}
                title="Kirim via WhatsApp"
                className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100"
              >
                <MessageCircle className="size-3.5" />
                WA
              </button>
            </>
          )}
          {!invoice.pdfUrl && (
            <Link href="/dashboard/invoice">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 border-slate-200 text-slate-600">
                <FileText className="size-3.5" />
                Detail
              </Button>
            </Link>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

// ── EventTableRow: baris event untuk tab Semua / RAB ────────────────────────────

function EventTableRow({
  event,
  invoiceInfo,
  onDeleteSuccess,
}: {
  event: Event
  invoiceInfo: InvoiceEventInfo | null
  onDeleteSuccess: () => void
}) {
  const [budgetTotal, setBudgetTotal] = useState<number | null>(null)
  const [isLoadingBudget, setIsLoadingBudget] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("token")
    axios
      .get(`/api/budgets/${event.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const budgetData = res.data.budget ?? res.data.data ?? res.data
        if (budgetData && Object.keys(budgetData).length > 0) {
          const total =
            Number(budgetData.totalEstimatedCost ?? 0) + Number(budgetData.contingencyFundAmount ?? 0)
          setBudgetTotal(total)
        } else {
          setBudgetTotal(null)
        }
      })
      .catch(() => setBudgetTotal(null))
      .finally(() => setIsLoadingBudget(false))
  }, [event.id])

  const handleDeleteEvent = async () => {
    if (!confirm(`Hapus event "${event.title}" beserta seluruh datanya secara permanen?`)) return
    try {
      const token = localStorage.getItem("token")
      await axios.delete(`/api/events/${event.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      onDeleteSuccess()
    } catch {
      alert("❌ Gagal menghapus event.")
    }
  }

  return (
    <TableRow className="border-slate-200 transition-colors hover:bg-slate-50">
      {/* Dokumen */}
      <TableCell className="py-4 pl-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-emerald-800">
            <CalendarRange className="size-4" />
          </div>
          <div className="leading-tight">
            <p className="font-mono text-sm font-medium text-slate-900">{event.title}</p>
            <span className="text-xs text-slate-500">Event</span>
          </div>
        </div>
      </TableCell>

      {/* Event & Lokasi */}
      <TableCell>
        <p className="max-w-60 truncate font-medium text-slate-900">{event.title}</p>
        <p className="max-w-60 truncate text-xs text-slate-500">{event.location}</p>
      </TableCell>

      {/* Tanggal Event */}
      <TableCell>
        <p className="text-sm text-slate-900">{formatDate(event.event_date)}</p>
      </TableCell>

      {/* Nilai RAB */}
      <TableCell className="text-right">
        {isLoadingBudget ? (
          <span className="text-xs text-slate-400 animate-pulse">Menghitung...</span>
        ) : (
          <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
            {formatCurrency(budgetTotal || 0)}
          </span>
        )}
      </TableCell>

      {/* Status */}
      <TableCell>
        <div className="flex flex-col gap-1">
          {isLoadingBudget ? (
            <span className="text-xs text-slate-400">...</span>
          ) : budgetTotal !== null ? (
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-xs font-medium border-emerald-200 bg-emerald-50 text-emerald-700">
              Ada RAB
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-xs font-medium border-amber-200 bg-amber-50 text-amber-700">
              Belum Ada RAB
            </Badge>
          )}
          {invoiceInfo ? (
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-xs font-medium border-emerald-200 bg-emerald-50 text-emerald-700">
              Ada Invoice
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-xs font-medium border-slate-200 bg-slate-50 text-slate-500">
              Belum Ada Invoice
            </Badge>
          )}
        </div>
      </TableCell>

      {/* Aksi */}
      <TableCell className="pr-5">
        <div className="flex items-center justify-end gap-1.5">
          <Link href={`/dashboard/rab/${event.id}`}>
            <Button size="sm" className="h-8 bg-emerald-800 text-white hover:bg-emerald-900">
              Kelola RAB
            </Button>
          </Link>
          {invoiceInfo && (
            <Link href="/dashboard/invoice">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                <FileText className="size-3.5" />
                Lihat Invoice
              </Button>
            </Link>
          )}
          <Button
            size="icon"
            variant="outline"
            onClick={handleDeleteEvent}
            className="h-8 w-8 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
            title="Hapus Event"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
