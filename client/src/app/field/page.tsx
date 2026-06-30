"use client"

import { useEffect, useState } from "react"
import { Wallet, ArrowLeft, CheckCircle, Send, RotateCcw, LogIn } from "lucide-react"
import Link from "next/link"

type Assignment = {
  eventId: string
  eventTitle: string
  eventDate: string
  division: string
  accountId: string | null
  balance: number
}

type Transaction = {
  id: string
  type: string
  amount: number
  description: string
  createdAt: string
}

type AccountDetail = {
  id: string
  division: string
  eventTitle: string
  eventDate: string
}

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
})

const getToken = () =>
  typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""
const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
})

type View = "loading" | "login" | "wrong-role" | "pick-event" | "main" | "expense-form" | "return-form" | "success"

export default function FieldPage() {
  const [view, setView] = useState<View>("loading")
  const [userName, setUserName] = useState("")
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null)
  const [account, setAccount] = useState<AccountDetail | null>(null)
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])

  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [loggingIn, setLoggingIn] = useState(false)

  const [txAmount, setTxAmount] = useState("")
  const [txDescription, setTxDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [txError, setTxError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  const checkAuth = async () => {
    const token = getToken()
    if (!token) { setView("login"); return }
    try {
      const res = await fetch("/api/auth/me", { headers: authHeaders() })
      if (!res.ok) { setView("login"); return }
      const data = await res.json()
      if (data.data.role !== "crew") { setView("wrong-role"); setUserName(data.data.name); return }
      setUserName(data.data.name)
      loadAssignments()
    } catch { setView("login") }
  }

  const loadAssignments = async () => {
    try {
      const res = await fetch("/api/crew/my-events", { headers: authHeaders() })
      const data = await res.json()
      if (data.success) {
        setAssignments(data.assignments)
        if (data.assignments.length === 1) { selectEvent(data.assignments[0]) }
        else { setView("pick-event") }
      } else { setView("pick-event") }
    } catch { setView("pick-event") }
  }

  const selectEvent = async (assignment: Assignment) => {
    setSelectedAssignment(assignment)
    if (!assignment.accountId) { setView("main"); setBalance(assignment.balance); return }
    try {
      const res = await fetch(`/api/petty-cash/my-account?eventId=${assignment.eventId}`, { headers: authHeaders() })
      const data = await res.json()
      if (data.success) { setAccount(data.account); setBalance(data.balance); setTransactions(data.transactions) }
    } catch {}
    setView("main")
  }

  useEffect(() => { checkAuth() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError("")
    setLoggingIn(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem("token", data.token)
        if (data.data.role !== "crew") { setView("wrong-role"); setUserName(data.data.name); return }
        setUserName(data.data.name)
        loadAssignments()
      } else {
        setLoginError(data.message ?? "Login gagal.")
      }
    } catch { setLoginError("Gagal menghubungi server.") }
    finally { setLoggingIn(false) }
  }

  const handleTransaction = async (type: "expense" | "return") => {
    setTxError("")
    const amt = parseFloat(txAmount.replace(/[^0-9]/g, ""))
    if (isNaN(amt) || amt <= 0) { setTxError("Masukkan nominal yang valid."); return }
    if (!selectedAssignment?.accountId) return
    setSubmitting(true)
    try {
      const desc = type === "return" ? (txDescription || "Pengembalian sisa kas") : txDescription
      const res = await fetch("/api/petty-cash/transaction", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ accountId: selectedAssignment.accountId, type, amount: amt, description: desc }),
      })
      const data = await res.json()
      if (data.success) {
        setBalance(data.balance)
        setTransactions((prev) => [data.transaction, ...prev])
        setSuccessMessage(
          type === "expense"
            ? `Pengeluaran ${IDR.format(amt)} berhasil dicatat!`
            : `Pengembalian ${IDR.format(amt)} berhasil! Saldo kamu sekarang ${IDR.format(data.balance)}.`
        )
        setTxAmount(""); setTxDescription(""); setView("success")
        setTimeout(() => setView("main"), 2500)
      } else { setTxError(data.message ?? "Gagal menyimpan transaksi.") }
    } catch { setTxError("Gagal menghubungi server.") }
    finally { setSubmitting(false) }
  }

  // ── VIEWS ──

  if (view === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-800 border-t-transparent" />
      </div>
    )
  }

  if (view === "login") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm">
          {/* Brand */}
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-800 text-white">
              <Wallet className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Field Crew</p>
              <p className="text-xs text-slate-500">nexEvent</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="email@kamu.com"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            {loginError && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{loginError}</p>
            )}
            <button
              type="submit"
              disabled={loggingIn}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 text-sm font-bold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
            >
              <LogIn className="size-4" />
              {loggingIn ? "Masuk..." : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (view === "wrong-role") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm text-center">
          <p className="mb-2 text-lg font-semibold text-slate-900">Hei, {userName}!</p>
          <p className="mb-6 text-sm text-slate-500">
            Halaman ini khusus untuk Field Crew. Akun kamu terdaftar sebagai promotor.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-900"
          >
            Ke Dashboard Promotor →
          </Link>
        </div>
      </div>
    )
  }

  if (view === "pick-event") {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-800 text-white">
              <Wallet className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Hei, {userName}!</p>
              <p className="text-xs text-slate-500">Pilih event yang ingin kamu kelola</p>
            </div>
          </div>
          {assignments.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-sm text-slate-400">
                Kamu belum ditambahkan ke event manapun. Hubungi promotormu.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {assignments.map((a) => (
                <li key={a.eventId}>
                  <button
                    onClick={() => selectEvent(a)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50 active:scale-[0.98]"
                  >
                    <p className="font-semibold text-slate-900">{a.eventTitle}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{a.division}</p>
                    <p className="mt-2 text-xl font-bold text-emerald-800">
                      {IDR.format(a.balance)}
                      <span className="ml-1.5 text-xs font-normal text-slate-500">saldo kas</span>
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  if (view === "success") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle className="size-9 text-emerald-700" />
        </div>
        <p className="mt-4 max-w-xs text-center text-lg font-semibold text-slate-900">{successMessage}</p>
      </div>
    )
  }

  if (view === "expense-form" || view === "return-form") {
    const isExpense = view === "expense-form"
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-md">
          <button
            onClick={() => { setView("main"); setTxAmount(""); setTxDescription(""); setTxError("") }}
            className="mb-6 flex min-h-[48px] items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft className="size-4" /> Kembali
          </button>

          <h2 className="mb-1 text-xl font-bold text-slate-900">
            {isExpense ? "Catat Pengeluaran" : "Kembalikan Sisa Kas"}
          </h2>
          {!isExpense && (
            <p className="mb-6 text-sm text-slate-500">
              Saldo kamu saat ini:{" "}
              <span className="font-semibold text-emerald-800">{IDR.format(balance)}</span>
            </p>
          )}
          {isExpense && <p className="mb-6 text-sm text-slate-500">Beli apa hari ini?</p>}

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                {isExpense ? "Nominal Pengeluaran" : "Nominal Dikembalikan"}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={txAmount ? Number(txAmount).toLocaleString("id-ID") : ""}
                onChange={(e) => setTxAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                autoFocus
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-3xl font-bold text-slate-900 placeholder:text-slate-300 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">
                {isExpense ? "Keterangan (beli apa?)" : "Keterangan"}
              </label>
              <input
                type="text"
                value={txDescription}
                onChange={(e) => setTxDescription(e.target.value)}
                placeholder={isExpense ? "Contoh: Makan kuli, bayar genset…" : "Pengembalian sisa kas"}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            {txError && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{txError}</p>
            )}
            <button
              onClick={() => handleTransaction(isExpense ? "expense" : "return")}
              disabled={submitting}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 text-base font-bold text-white transition-colors hover:bg-emerald-900 disabled:opacity-50"
            >
              {submitting
                ? "Menyimpan..."
                : isExpense
                ? "Simpan Pengeluaran"
                : `Kembalikan ${txAmount ? IDR.format(Number(txAmount)) : ""}`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main view
  const todayTx = transactions.filter((t) => {
    const today = new Date().toDateString()
    return new Date(t.createdAt).toDateString() === today
  })

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">{userName}</p>
            <p className="text-xs text-slate-500">
              {account?.division ?? selectedAssignment?.division} · {account?.eventTitle ?? selectedAssignment?.eventTitle}
            </p>
          </div>
          {assignments.length > 1 && (
            <button
              onClick={() => setView("pick-event")}
              className="min-h-[48px] px-3 text-xs font-medium text-emerald-700 hover:underline"
            >
              Ganti event
            </button>
          )}
        </div>

        {/* Balance card */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            SALDO KAS KAMU
          </p>
          <p className="text-4xl font-bold text-emerald-800">{IDR.format(balance)}</p>
        </div>

        {/* Action buttons */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => { setView("expense-form"); setTxAmount(""); setTxDescription(""); setTxError("") }}
            className="flex min-h-[64px] items-center justify-center gap-2 rounded-xl bg-emerald-800 text-sm font-bold text-white transition-colors hover:bg-emerald-900 active:scale-[0.97]"
          >
            <Send className="h-5 w-5 shrink-0" />
            <span>CATAT PENGELUARAN</span>
          </button>
          <button
            onClick={() => { setView("return-form"); setTxAmount(""); setTxDescription(""); setTxError("") }}
            disabled={balance <= 0}
            className="flex min-h-[64px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 active:scale-[0.97] disabled:opacity-40"
          >
            <RotateCcw className="h-5 w-5 shrink-0" />
            <span>KEMBALIKAN SISA</span>
          </button>
        </div>

        {/* Recent transactions */}
        {todayTx.length > 0 && (
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              Riwayat Hari Ini
            </p>
            <ul className="space-y-2">
              {todayTx.slice(0, 5).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3.5"
                >
                  <div className="min-w-0 mr-3">
                    <p className="truncate text-sm font-medium text-slate-900">{t.description}</p>
                    <p className={`mt-0.5 text-xs font-medium ${
                      t.type === "topup" ? "text-blue-600"
                      : t.type === "expense" ? "text-red-500"
                      : "text-emerald-600"
                    }`}>
                      {t.type === "topup" ? "Topup" : t.type === "expense" ? "Expense" : "Return"}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-semibold ${
                      t.type === "topup"
                        ? "text-blue-600"
                        : t.type === "expense"
                        ? "text-red-600"
                        : "text-slate-500"
                    }`}
                  >
                    {t.type === "expense" ? "-" : "+"}{IDR.format(t.amount)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
