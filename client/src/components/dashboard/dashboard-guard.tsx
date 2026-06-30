"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function DashboardGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token) {
      router.push("/login")
      return
    }
    // Cached role check (fast path — no network) untuk semua user baru
    const cachedRole = localStorage.getItem("user_role")
    if (cachedRole === "crew") {
      router.push("/field")
      return
    }
    // Fallback: verifikasi ke server untuk token lama yang tidak punya user_role di localStorage
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) {
          router.push("/login")
          return
        }
        const role = data.data?.role
        if (role) localStorage.setItem("user_role", role)
        if (role === "crew") router.push("/field")
      })
      .catch(() => {})
  }, [router])

  return <>{children}</>
}
