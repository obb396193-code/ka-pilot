import { SidebarInset } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SessionProvider, WorkspaceScope } from "@/components/business/session/session-provider"
import { ThemeProvider } from "@/components/business/theme/theme-provider"
import { AgentLauncher } from "@/components/business/agent/agent-launcher"
import { CommandPalette } from "@/components/business/command/command-palette"
import { MobileDutyBanner, MobileDutyScope } from "@/components/business/mobile/duty-guard"
import { AppSidebarProvider } from "@/components/business/layout/app-sidebar-provider"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionProvider>
      <ThemeProvider>
      <AppSidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader />
          <MobileDutyBanner />
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              <MobileDutyScope><WorkspaceScope>{children}</WorkspaceScope></MobileDutyScope>
            </div>
          </div>
        </SidebarInset>
      </AppSidebarProvider>
      <CommandPalette />
      <AgentLauncher />
      <Toaster position="top-center" />
      </ThemeProvider>
    </SessionProvider>
  )
}
