"use client"

import { useEffect, useState, useCallback } from "react"
import { Banknote, Wallet, Pencil, Check, Download, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useUser } from "@/hooks/useUser"

type Bank = { filled: boolean; bankName: string | null; bankAccount: string | null; accountHolder: string | null }
type Balance = { available: number; gross: number; reserved: number; bank: Bank }
type PayoutRequest = {
  id: string
  amount: number
  debtDeducted: number
  status: "pending" | "approved" | "rejected" | "transferred"
  requestedAt: string
  processedAt: string | null
  adminNote: string | null
}

const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })
const getToken = () => (typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "")
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" })

const STATUS_BADGE: Record<PayoutRequest["status"], { label: string; cls: string }> = {
  pending: { label: "Menunggu Persetujuan", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "Disetujui", cls: "bg-blue-100 text-blue-700" },
  transferred: { label: "Sudah Ditransfer", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Ditolak", cls: "bg-red-100 text-red-700" },
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

export default function PayoutPage() {
  const { loading: userLoading } = useUser()

  const [balance, setBalance] = useState<Balance | null>(null)
  const [requests, setRequests] = useState<PayoutRequest[]>([])
  const [loading, setLoading] = useState(true)

  const [amount, setAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState("")
  const [formSuccess, setFormSuccess] = useState("")
  // Breakdown penolakan karena saldo tak cukup menutup nominal + hutang fee (item #2, model koreksi).
  const [rejectInfo, setRejectInfo] = useState<
    { totalDebt: number; availableBalance: number; requestedAmount: number; maxAllowedAmount: number } | null
  >(null)

  // Bank edit
  const [editingBank, setEditingBank] = useState(false)
  const [bankName, setBankName] = useState("")
  const [bankAccount, setBankAccount] = useState("")
  const [accountHolder, setAccountHolder] = useState("")
  const [savingBank, setSavingBank] = useState(false)
  const [bankError, setBankError] = useState("")

  // Download laporan pencairan (hanya untuk status "transferred")
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [balRes, reqRes] = await Promise.all([
        fetch("/api/payout/balance", { headers: authHeaders() }),
        fetch("/api/payout/my-requests", { headers: authHeaders() }),
      ])
      const balData = await balRes.json()
      const reqData = await reqRes.json()
      if (balData.success) {
        setBalance(balData)
        setBankName(balData.bank.bankName ?? "")
        setBankAccount(balData.bank.bankAccount ?? "")
        setAccountHolder(balData.bank.accountHolder ?? "")
        if (!balData.bank.filled) setEditingBank(true)
      }
      if (reqData.success) setRequests(reqData.requests)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault()
    setBankError("")
    if (!bankName.trim() || !bankAccount.trim() || !accountHolder.trim()) {
      setBankError("Semua kolom rekening wajib diisi.")
      return
    }
    setSavingBank(true)
    try {
      const res = await fetch("/api/settings/promoter", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ bankName: bankName.trim(), bankAccount: bankAccount.trim(), accountHolder: accountHolder.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setEditingBank(false)
        await load()
      } else {
        setBankError(data.message ?? "Gagal menyimpan rekening.")
      }
    } catch {
      setBankError("Gagal menghubungi server.")
    } finally {
      setSavingBank(false)
    }
  }

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError("")
    setFormSuccess("")
    setRejectInfo(null)
    const amt = parseInt(amount || "0", 10)
    if (!amt || amt <= 0) { setFormError("Masukkan nominal yang valid."); return }
    setSubmitting(true)
    try {
      const res = await fetch("/api/payout/request", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ amount: amt }),
      })
      const data = await res.json()
      if (data.success) {
        setAmount("")
        setFormSuccess("Pengajuan pencairan terkirim. Menunggu persetujuan admin.")
        await load()
      } else if (data.debtBreakdown) {
        // Ditolak karena nominal + hutang fee melebihi saldo — tampilkan rincian + saran max.
        setRejectInfo(data.debtBreakdown)
      } else {
        setFormError(data.message ?? "Gagal mengajukan pencairan.")
      }
    } catch {
      setFormError("Gagal menghubungi server.")
    } finally {
      setSubmitting(false)
    }
  }

  // Pola aman download PDF (lihat known-bugs.md): cek res.ok dulu; kalau error parse JSON,
  // kalau sukses langsung blob (content-type via proxy tidak reliable).
  const handleDownloadStatement = async (id: string) => {
    setDownloadingId(id)
    try {
      const res = await fetch(`/api/payout/${id}/statement-pdf`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) {
        let message = `Server error (${res.status})`
        try {
          const errData = await res.json()
          message = (errData as Record<string, unknown>).message as string || message
        } catch { message = res.statusText || message }
        alert("Gagal mengunduh laporan: " + message)
        return
      }
      const blob = await res.blob()
      if (blob.size < 100) { alert("Laporan kosong — coba lagi."); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Laporan-Pencairan-${id}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      alert("Gagal mengunduh laporan: " + (e instanceof Error ? e.message : "Unknown error"))
    } finally {
      setDownloadingId(null)
    }
  }

  if (userLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
      </div>
    )
  }

  const bankFilled = balance?.bank.filled ?? false

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* Kembali ke pintu utama kategori Tiket & Pencairan.
          TANPA ?eventId= — DISENGAJA, bukan kelalaian. Payout bersifat LINTAS EVENT (saldo &
          pengajuan tidak terikat satu event; halaman ini memang tidak punya pemilih event sama
          sekali), jadi tidak ada konteks event untuk dipertahankan. Halaman detail lain di pola hub
          ini (mis. Manajemen Tiket) memang mewarisi eventId — payout pengecualian yang disengaja.
          JANGAN tambahkan eventId/redirect/pemilih event ke halaman ini. */}
      <div>
        <Link
          href="/dashboard/ticketing"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft className="size-4" />
          Kembali ke Dashboard Ticketing
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
          <Banknote className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Pencairan Dana</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Cairkan hasil penjualan tiket ke rekening Anda. Dana bisa dicairkan kapan saja.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: balance + request */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Balance card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Saldo Bisa Dicairkan</p>
            <p className="mt-1 text-3xl font-bold text-emerald-800">{IDR.format(balance?.available ?? 0)}</p>
            <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <div className="flex justify-between">
                <span>Total pemasukan (setelah fee)</span>
                <span className="font-medium text-slate-700">{IDR.format(balance?.gross ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Sudah diajukan / dicairkan</span>
                <span className="font-medium text-slate-700">− {IDR.format(balance?.reserved ?? 0)}</span>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              Pajak (jika ada) tetap menjadi hak Anda dan sudah termasuk. nexEvent hanya memotong biaya platform.
            </p>
          </div>

          {/* Bank details */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Rekening Tujuan</p>
              {bankFilled && !editingBank && (
                <button
                  onClick={() => setEditingBank(true)}
                  className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                >
                  <Pencil className="size-3.5" /> Ubah
                </button>
              )}
            </div>

            {editingBank ? (
              <form onSubmit={handleSaveBank} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Nama Bank</label>
                  <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="BCA / Mandiri / BNI…"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Nomor Rekening</label>
                  <input value={bankAccount} onChange={(e) => setBankAccount(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="1234567890"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Atas Nama</label>
                  <input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} placeholder="Nama pemilik rekening"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30" />
                </div>
                {bankError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{bankError}</p>}
                <button type="submit" disabled={savingBank}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50">
                  <Check className="size-4" /> {savingBank ? "Menyimpan..." : "Simpan Rekening"}
                </button>
              </form>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-slate-900">{balance?.bank.bankName}</p>
                <p className="font-mono text-slate-700">{balance?.bank.bankAccount}</p>
                <p className="text-slate-500">a/n {balance?.bank.accountHolder}</p>
              </div>
            )}
          </div>

          {/* Request form */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="mb-1 text-sm font-semibold text-slate-900">Ajukan Pencairan</p>
            {!bankFilled ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Lengkapi data rekening di atas dulu sebelum mengajukan pencairan.
              </p>
            ) : (
              <form onSubmit={handleRequest} className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Nominal Pencairan</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amount ? Number(amount).toLocaleString("id-ID") : ""}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-lg font-semibold text-slate-900 placeholder:text-slate-300 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                  />
                  <p className="mt-1 text-xs text-slate-400">Maks {IDR.format(balance?.available ?? 0)}</p>
                </div>
                {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{formError}</p>}
                {formSuccess && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{formSuccess}</p>}
                {rejectInfo && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                    <p className="font-semibold">Pencairan tidak bisa diproses.</p>
                    <p className="mt-1 text-red-600">
                      Nominal Anda ({IDR.format(rejectInfo.requestedAmount)}) ditambah hutang fee cash
                      ({IDR.format(rejectInfo.totalDebt)}) melebihi saldo Anda ({IDR.format(rejectInfo.availableBalance)}).
                    </p>
                    <div className="mt-2 space-y-0.5 border-t border-red-200 pt-2 text-red-600">
                      <div className="flex justify-between"><span>Saldo tersedia</span><span className="font-medium">{IDR.format(rejectInfo.availableBalance)}</span></div>
                      <div className="flex justify-between"><span>Hutang fee cash</span><span className="font-medium">− {IDR.format(rejectInfo.totalDebt)}</span></div>
                      <div className="flex justify-between border-t border-red-200 pt-0.5 font-bold text-red-800">
                        <span>Maksimal bisa diajukan</span><span>{IDR.format(rejectInfo.maxAllowedAmount)}</span>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-red-500">
                      Turunkan nominal menjadi maksimal {IDR.format(rejectInfo.maxAllowedAmount)}, lalu ajukan lagi.
                    </p>
                  </div>
                )}
                <button type="submit" disabled={submitting || (balance?.available ?? 0) <= 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50">
                  <Wallet className="size-4" /> {submitting ? "Mengajukan..." : "Ajukan Pencairan"}
                </button>
              </form>
            )}
            <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
              Ada kendala atau sengketa? Hubungi CS nexEvent: WhatsApp{" "}
              <span className="font-medium text-slate-600">0812-3456-7890</span> atau email{" "}
              <span className="font-medium text-slate-600">support@nexeventapp.tech</span>.
            </p>
          </div>
        </div>

        {/* Right: history */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="mb-4 text-sm font-semibold text-slate-900">Riwayat Pencairan ({requests.length})</p>
            {requests.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Belum ada pengajuan pencairan.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-2 font-medium">Tanggal</th>
                      <th className="px-2 py-2 text-right font-medium">Nominal</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Catatan</th>
                      <th className="px-2 py-2 font-medium">Laporan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {requests.map((r) => (
                      <tr key={r.id}>
                        <td className="px-2 py-3 text-slate-500">{fmtDate(r.requestedAt)}</td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-900">
                          {IDR.format(r.amount)}
                          {r.debtDeducted > 0 && (
                            <span className="mt-0.5 block text-[10px] font-normal text-amber-600">
                              − {IDR.format(r.debtDeducted)} potong hutang fee
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[r.status].cls}`}>
                            {STATUS_BADGE[r.status].label}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-xs text-slate-400">{r.adminNote || "—"}</td>
                        <td className="px-2 py-3">
                          {r.status === "transferred" ? (
                            <button
                              onClick={() => handleDownloadStatement(r.id)}
                              disabled={downloadingId === r.id}
                              className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <Download className="size-3.5" />
                              {downloadingId === r.id ? "Mengunduh..." : "Laporan"}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
