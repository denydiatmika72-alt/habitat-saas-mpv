import { Sidebar, MobileNav } from "@/components/dashboard/sidebar"
import { TopBar } from "@/components/dashboard/top-bar"
import { DashboardGuard } from "@/components/dashboard/dashboard-guard"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DashboardGuard>
      <div className="flex min-h-screen bg-slate-50 text-slate-900">
        {/* Persistent Sidebar — desktop only */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Persistent Top Bar */}
          <TopBar />

          {/* Page Content — extra bottom padding on mobile for the nav bar */}
          <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:py-8 lg:pb-8">
            {children}
          </main>
        </div>
      </div>

      {/* Bottom navigation — mobile only, outside the flex container */}
      <MobileNav />
    </DashboardGuard>
  )
}
