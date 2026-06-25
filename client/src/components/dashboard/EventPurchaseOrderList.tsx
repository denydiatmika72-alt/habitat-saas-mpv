"use client"

import { useEffect, useState } from "react"
import { PackageOpen, RotateCw, FileDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type PO = {
  id: string
  title: string
  status: string
  totalAmount: number
  notes: string | null
  createdAt: string
  event?: { id: string; title: string }
}

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

function statusBadge(status: string) {
  if (status === "paid") return "bg-emerald-100 text-emerald-700 border-emerald-200"
  if (status === "sent") return "bg-blue-100 text-blue-700 border-blue-200"
  return "bg-slate-100 text-slate-600 border-slate-200"
}

function statusLabel(status: string) {
  if (status === "paid") return "Paid"
  if (status === "sent") return "Sent"
  return "Draft"
}

function getToken() {
  return typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
}

export function EventPurchaseOrderList({ eventId }: { eventId?: string }) {
  const [pos, setPos] = useState<PO[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    const url = eventId ? `/api/po?eventId=${eventId}` : `/api/po`
    fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.json())
      .then((json) => { if (json.success) setPos(json.data ?? []) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [eventId])

  async function downloadPdf(id: string, title: string) {
    setDownloadingId(id)
    try {
      const res = await fetch(`/api/po/${id}/pdf`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error("Gagal")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${title.replace(/\s+/g, "-")}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert("Gagal mengunduh PDF. Pastikan server berjalan.")
    }
    setDownloadingId(null)
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <RotateCw className="mx-auto size-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (pos.length === 0) {
    return (
      <div className="py-16 text-center text-slate-400">
        <PackageOpen className="mx-auto mb-3 size-10 opacity-30" />
        <p className="text-sm">Belum ada Purchase Order.</p>
      </div>
    )
  }

  const showEventCol = !eventId

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 hover:bg-transparent">
          <th className="py-3.5 pl-5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Judul PO
          </th>
          {showEventCol && (
            <th className="py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Event
            </th>
          )}
          <th className="py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Tanggal
          </th>
          <th className="py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Status
          </th>
          <th className="py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Total
          </th>
          <th className="py-3.5 pr-5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Aksi
          </th>
        </tr>
      </thead>
      <tbody>
        {pos.map((po) => (
          <tr key={po.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
            <td className="py-3.5 pl-5">
              <p className="font-medium text-slate-900">{po.title}</p>
              {po.notes && (
                <p className="max-w-48 truncate text-xs text-slate-400">{po.notes}</p>
              )}
            </td>
            {showEventCol && (
              <td className="py-3.5 text-slate-600">{po.event?.title ?? "-"}</td>
            )}
            <td className="py-3.5 text-slate-600">
              {new Date(po.createdAt).toLocaleDateString("id-ID", {
                day: "numeric", month: "short", year: "numeric",
              })}
            </td>
            <td className="py-3.5">
              <Badge
                variant="outline"
                className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusBadge(po.status))}
              >
                {statusLabel(po.status)}
              </Badge>
            </td>
            <td className="py-3.5 text-right font-mono font-semibold text-emerald-700">
              {IDR.format(po.totalAmount)}
            </td>
            <td className="py-3.5 pr-5 text-right">
              <button
                onClick={() => downloadPdf(po.id, po.title)}
                disabled={downloadingId === po.id}
                title="Unduh PDF"
                className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {downloadingId === po.id
                  ? <RotateCw className="size-3.5 animate-spin" />
                  : <FileDown className="size-3.5" />
                }
                PDF
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
