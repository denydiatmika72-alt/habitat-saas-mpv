"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, X } from "lucide-react"
import { useUser } from "@/hooks/useUser"

type Event = { id: string; title: string }

const getToken = () =>
  typeof window !== "undefined" ? (localStorage.getItem("token") ?? "") : ""

export function ProExpiryBanner() {
  const { user, isProExpiringSoon, daysUntilExpiry } = useUser()
  const [dismissed, setDismissed] = useState(false)
  const [eventTitle, setEventTitle] = useState("")

  useEffect(() => {
    if (!isProExpiringSoon || !user?.proEventId) return
    fetch("/api/events", { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const found = (data?.data as Event[] | undefined)?.find((e) => e.id === user.proEventId)
        if (found) setEventTitle(found.title)
      })
      .catch(() => {})
  }, [isProExpiringSoon, user?.proEventId])

  if (!isProExpiringSoon || dismissed) return null

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
      <p className="flex-1 text-sm text-amber-800">
        Lisensi Pro {eventTitle && <>event <strong>{eventTitle}</strong> </>}
        akan berakhir dalam <strong>{daysUntilExpiry} hari</strong>.{" "}
        <Link href="/dashboard/upgrade" className="font-semibold underline hover:text-amber-900">
          Perpanjang Sekarang →
        </Link>
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 text-amber-500 hover:text-amber-700"
        aria-label="Tutup"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
