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

  // Login form
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [loggingIn, setLoggingIn] = useState(false)

  // Transaction form
  const [txAmount, setTxAmount] = useState("")
  const [txDescription, setTxDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [txError, setTxError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  const checkAuth = async () => {
    const token = getToken()
    if (!token) {
      setView("login")
      return
    }
    try {
      const res = await fetch("/api/auth/me", { headers: authHeaders() })
      if (!res.ok) {
        setView("login")
        return
      }
      const data = await res.json()
      if (data.data.role !== "crew") {
        setView("wrong-role")
        setUserName(data.data.name)
        return
      }
      setUserName(data.data.name)
      loadAssignments()
    } catch {
      setView("login")
    }
  }

  const loadAssignments = async () => {
    try {
      const res = await fetch("/api/crew/my-events", { headers: authHeaders() })
      const data = await res.json()
      if (data.success) {
        setAssignments(data.assignments)
        if (data.assignments.length === 1) {
          selectEvent(data.assignments[0])
        } else {
          setView("pick-event")
        }
      } else {
        setView("pick-event")
      }
    } catch {
      setView("pick-event")
    }
  }

  const selectEvent = async (assignment: Assignment) => {
    setSelectedAssignment(assignment)
    if (!assignment.accountId) {
      setView("main")
      setBalance(assignment.balance)
      return
    }
    try {
      const res = await fetch(`/api/petty-cash/my-account?eventId=${assignment.eventId}`, {
        headers: authHeaders(),
      })
      const data = await res.json()
      if (data.success) {
        setAccount(data.account)
        setBalance(data.balance)
        setTransactions(data.transactions)
      }
    } catch {}
    setView("main")
  }

  useEffect(() => {
    checkAuth()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        if (data.data.role !== "crew") {
          setView("wrong-role")
          setUserName(data.data.name)
          return
        }
        setUserName(data.data.name)
        loadAssignments()
      } else {
        setLoginError(data.message ?? "Login gagal.")
      }
    } catch {
      setLoginError("Gagal menghubungi server.")
    } finally {
      setLoggingIn(false)
    }
  }

  const handleTransaction = async (type: "expense" | "return") => {
    setTxError("")
    const amt = parseFloat(txAmount.replace(/[^0-9]/g, ""))
    if (isNaN(amt) || amt <= 0) {
      setTxError("Masukkan nominal yang valid.")
      return
    }
    if (!selectedAssignment?.accountId) return
    setSubmitting(true)
    try {
      const desc = type === "return"
        ? (txDescription || "Pengembalian sisa kas")
        : txDescription
      const res = await fetch("/api/petty-cash/transaction", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          accountId: selectedAssignment.accountId,
          type,
          amount: amt,
          description: desc,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setBalance(data.balance)
        setTransactions((prev) => [data.transaction, ...prev])
        const msg =
          type === "expense"
            ? `Pengeluaran ${IDR.format(amt)} berhasil dicatat!`
            : `Pengembalian ${IDR.format(amt)} berhasil! Saldo kamu sekarang ${IDR.format(data.balance)}.`
        setSuccessMessage(msg)
        setTxAmount("")
        setTxDescription("")
        setView("success")
        setTimeout(() => setView("main"), 2500)
      } else {
        setTxError(data.message ?? "Gagal menyimpan transaksi.")
      }
    } catch {
      setTxError("Gagal menghubungi server.")
    } finally {
      setSubmitting(false)
    }
  }

  // ── VIEWS ──

  if (view === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  if (view === "login") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500">
              <Wallet className="size-5 text-neutral-950" />
            </div>
            <div>
              <p className="font-semibold text-white">Field Crew</p>
              <p className="text-xs text-neutral-400">nexEvent</p>
            </div>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-400">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="email@kamu.com"
                required
                className="w-full rounded-xl bg-neutral-800 px-4 py-3.5 text-sm text-white placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-400">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••"
                required
                className="w-full rounded-xl bg-neutral-800 px-4 py-3.5 text-sm text-white placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            {loginError && (
              <p className="rounded-xl bg-red-900/40 px-4 py-2.5 text-sm text-red-400">{loginError}</p>
            )}
            <button
              type="submit"
              disabled={loggingIn}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-sm font-bold text-neutral-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
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
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
        <div className="max-w-sm text-center">
          <p className="mb-2 text-lg font-semibold text-white">Hei, {userName}!</p>
          <p className="mb-6 text-sm text-neutral-400">
            Halaman ini khusus untuk Field Crew. Akun kamu terdaftar sebagai promotor.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-neutral-950"
          >
            Ke Dashboard Promotor →
          </Link>
        </div>
      </div>
    )
  }

  if (view === "pick-event") {
    return (
      <div className="min-h-screen bg-neutral-950 px-4 py-8">
        <div className="mx-auto max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500">
              <Wallet className="size-5 text-neutral-950" />
            </div>
            <div>
              <p className="font-semibold text-white">Hei, {userName}!</p>
              <p className="text-xs text-neutral-400">Pilih event yang ingin kamu kelola</p>
            </div>
          </div>
          {assignments.length === 0 ? (
            <p className="text-center text-sm text-neutral-500">
              Kamu belum ditambahkan ke event manapun. Hubungi promotormu.
            </p>
          ) : (
            <ul className="space-y-3">
              {assignments.map((a) => (
                <li key={a.eventId}>
                  <button
                    onClick={() => selectEvent(a)}
                    className="w-full rounded-2xl bg-neutral-800 p-4 text-left transition-colors hover:bg-neutral-700 active:scale-[0.98]"
                  >
                    <p className="font-semibold text-white">{a.eventTitle}</p>
                    <p className="mt-0.5 text-xs text-neutral-400">{a.division}</p>
                    <p className="mt-2 text-lg font-bold text-amber-400">
                      {IDR.format(a.balance)}
                      <span className="ml-1 text-xs font-normal text-neutral-500">saldo kas</span>
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-4">
        <CheckCircle className="mb-4 size-16 text-amber-400" />
        <p className="max-w-xs text-center text-lg font-semibold text-white">{successMessage}</p>
      </div>
    )
  }

  if (view === "expense-form" || view === "return-form") {
    const isExpense = view === "expense-form"
    return (
      <div className="min-h-screen bg-neutral-950 px-4 py-8">
        <div className="mx-auto max-w-md">
          <button
            onClick={() => { setView("main"); setTxAmount(""); setTxDescription(""); setTxError("") }}
            className="mb-6 flex items-center gap-2 text-sm text-neutral-400"
          >
            <ArrowLeft className="size-4" /> Kembali
          </button>

          <h2 className="mb-1 text-xl font-bold text-white">
            {isExpense ? "Catat Pengeluaran" : "Kembalikan Sisa Kas"}
          </h2>
          {!isExpense && (
            <p className="mb-6 text-sm text-neutral-400">
              Saldo kamu saat ini: <span className="font-semibold text-amber-400">{IDR.format(balance)}</span>
            </p>
          )}
          {isExpense && <p className="mb-6 text-sm text-neutral-400">Beli apa hari ini?</p>}

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-400">
                {isExpense ? "Nominal Pengeluaran" : "Nominal Dikembalikan"}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={txAmount ? Number(txAmount).toLocaleString("id-ID") : ""}
                onChange={(e) => setTxAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                autoFocus
                className="w-full rounded-xl bg-neutral-800 px-4 py-4 text-2xl font-bold text-white placeholder:text-neutral-600 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-400">
                {isExpense ? "Keterangan (beli apa?)" : "Keterangan"}
              </label>
              <input
                type="text"
                value={txDescription}
                onChange={(e) => setTxDescription(e.target.value)}
                placeholder={isExpense ? "Contoh: Makan kuli, bayar genset…" : "Pengembalian sisa kas"}
                className="w-full rounded-xl bg-neutral-800 px-4 py-3.5 text-sm text-white placeholder:text-neutral-500 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            {txError && (
              <p className="rounded-xl bg-red-900/40 px-4 py-2.5 text-sm text-red-400">{txError}</p>
            )}
            <button
              onClick={() => handleTransaction(isExpense ? "expense" : "return")}
              disabled={submitting}
              className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 text-base font-bold text-neutral-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
            >
              {submitting ? "Menyimpan..." : isExpense ? "💸 Simpan Pengeluaran" : `↩ Kembalikan ${txAmount ? IDR.format(Number(txAmount)) : ""}`}
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
    <div className="min-h-screen bg-neutral-950 px-4 py-8">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-400">{userName}</p>
            <p className="text-xs text-neutral-600">
              {account?.division ?? selectedAssignment?.division} · {account?.eventTitle ?? selectedAssignment?.eventTitle}
            </p>
          </div>
          {assignments.length > 1 && (
            <button
              onClick={() => setView("pick-event")}
              className="text-xs text-neutral-500 underline"
            >
              Ganti event
            </button>
          )}
        </div>

        {/* Balance card */}
        <div className="mb-8 rounded-3xl bg-neutral-800 p-6">
          <p className="mb-1 text-sm uppercase tracking-widest text-neutral-500">SALDO KAS KAMU</p>
          <p className="text-4xl font-bold text-white">{IDR.format(balance)}</p>
        </div>

        {/* Action buttons */}
        <div className="mb-8 grid grid-cols-2 gap-3">
          <button
            onClick={() => { setView("expense-form"); setTxAmount(""); setTxDescription(""); setTxError("") }}
            className="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-amber-500 text-sm font-bold text-neutral-950 transition-colors hover:bg-amber-400 active:scale-[0.97]"
          >
            <Send className="size-4" />
            CATAT PENGELUARAN
          </button>
          <button
            onClick={() => { setView("return-form"); setTxAmount(""); setTxDescription(""); setTxError("") }}
            disabled={balance <= 0}
            className="flex min-h-[64px] items-center justify-center gap-2 rounded-2xl bg-neutral-700 text-sm font-bold text-white transition-colors hover:bg-neutral-600 active:scale-[0.97] disabled:opacity-40"
          >
            <RotateCcw className="size-4" />
            KEMBALIKAN SISA
          </button>
        </div>

        {/* Recent transactions */}
        {todayTx.length > 0 && (
          <div>
            <p className="mb-3 text-xs uppercase tracking-widest text-neutral-500">Riwayat Hari Ini</p>
            <ul className="space-y-2">
              {todayTx.slice(0, 5).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-2xl bg-neutral-800 px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-white">{t.description}</p>
                    <p className="text-xs text-neutral-500 capitalize">{t.type}</p>
                  </div>
                  <p
                    className={`text-sm font-semibold ${
                      t.type === "topup"
                        ? "text-blue-400"
                        : t.type === "expense"
                        ? "text-red-400"
                        : "text-neutral-400"
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
