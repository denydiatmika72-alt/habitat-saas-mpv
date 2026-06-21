"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import Link from "next/link"
import { CalendarRange, Trash2 } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

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

type Filter = "Semua" | "Invoice" | "RAB"

export function DocumentTable() {
  const [filter, setFilter] = useState<Filter>("Semua")
  const [events, setEvents] = useState<Event[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchEvents = () => {
    const token = localStorage.getItem("token")
    axios.get("http://localhost:5000/api/events", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data.data ?? []
        setEvents(data)
      })
      .catch((err) => console.error("Gagal mengambil events", err))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    fetchEvents()
  }, [])

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
          </TabsList>
        </Tabs>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-200 hover:bg-transparent">
              <TableHead className="py-3.5 pl-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Dokumen</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Event & Lokasi</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tanggal Event</TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Nilai</TableHead>
              <TableHead className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Status</TableHead>
              <TableHead className="pr-5 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-slate-500">Memuat data event...</TableCell></TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm text-slate-500">Belum ada event. Silakan buat Event pertama Anda.</p>
                    <Link href="/dashboard/create-event">
                      <Button className="h-9 bg-emerald-800 text-white hover:bg-emerald-900">Buat Event</Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <EventTableRow key={event.id} event={event} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function EventTableRow({ event }: { event: Event }) {
  const [budgetTotal, setBudgetTotal] = useState<number | null>(null)
  const [isLoadingBudget, setIsLoadingBudget] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("token")
    axios.get(`http://localhost:5000/api/budgets/${event.id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const budgetData = res.data.budget ?? res.data.data ?? res.data
        if (budgetData && Object.keys(budgetData).length > 0) {
          const total = Number(budgetData.totalEstimatedCost ?? 0) + Number(budgetData.contingencyFundAmount ?? 0)
          setBudgetTotal(total)
        } else {
          setBudgetTotal(null)
        }
      })
      .catch(() => setBudgetTotal(null))
      .finally(() => setIsLoadingBudget(false))
  }, [event.id])

  // FUNGSI MENGHAPUS EVENT
  const handleDeleteEvent = async () => {
    if (!confirm(`Hapus event "${event.title}" beserta seluruh datanya secara permanen?`)) return;
    
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`http://localhost:5000/api/events/${event.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Refresh halaman agar tabel terupdate otomatis
      window.location.reload();
    } catch (error) {
      alert("❌ Gagal menghapus event. (Pastikan endpoint DELETE /api/events/:id tersedia di backend Anda).");
      console.error(error);
    }
  };

  return (
    <TableRow className="border-slate-200 transition-colors hover:bg-slate-50">
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
      <TableCell>
        <p className="max-w-60 truncate font-medium text-slate-900">{event.title}</p>
        <p className="max-w-60 truncate text-xs text-slate-500">{event.location}</p>
      </TableCell>
      <TableCell>
        <p className="text-sm text-slate-900">{formatDate(event.event_date)}</p>
      </TableCell>
      <TableCell className="text-right">
        {isLoadingBudget ? (
          <span className="text-xs text-slate-400 animate-pulse">Menghitung...</span>
        ) : (
          <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
            {formatCurrency(budgetTotal || 0)}
          </span>
        )}
      </TableCell>
      <TableCell>
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
      </TableCell>
      <TableCell className="pr-5">
        <div className="flex items-center justify-end gap-1.5">
          <Link href={`/dashboard/rab/${event.id}`}>
            <Button size="sm" className="h-8 bg-emerald-800 text-white hover:bg-emerald-900">
              Kelola RAB
            </Button>
          </Link>
          {/* TOMBOL HAPUS EVENT */}
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