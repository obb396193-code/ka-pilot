import { AgentCommandShell } from "@/components/business/agent/agent-command-shell"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader() {
  const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">经营工作台</h1>
        <div className="ml-auto flex items-center gap-2">
          {isMock ? <Badge variant="outline" className="hidden sm:inline-flex">脱敏 Mock</Badge> : null}
          <AgentCommandShell />
        </div>
      </div>
    </header>
  )
}
