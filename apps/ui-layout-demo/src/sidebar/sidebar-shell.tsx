import {
  Bell,
  Blocks,
  ChartNoAxesCombined,
  CircleUserRound,
  Database,
  FileChartColumn,
  FolderKanban,
  LayoutDashboard,
  Library,
  Search,
  Settings2,
  Shapes,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { DashboardContent } from "@/shared/dashboard-content";
import { ThemeToggle } from "@/shared/theme-toggle";

const primaryItems = [
  { label: "工作台", icon: LayoutDashboard, active: true },
  { label: "投放任务", icon: FolderKanban },
  { label: "数据分析", icon: ChartNoAxesCombined },
  { label: "账户资源", icon: Database },
  { label: "自动化", icon: Workflow, badge: 3 },
];

const resourceItems = [
  { label: "商品素材", icon: Shapes },
  { label: "报告中心", icon: FileChartColumn },
  { label: "知识库", icon: Library },
];

function ProductSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="投放 Agent">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Sparkles className="size-4" />
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">投放 Agent</span>
                <span className="truncate text-xs text-muted-foreground">
                  运营工作台
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>经营与执行</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      type="button"
                      isActive={item.active}
                      tooltip={item.label}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.badge ? (
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>资产与沉淀</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {resourceItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton type="button" tooltip={item.label}>
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton type="button" tooltip="集成与通知">
                  <Blocks />
                  <span>集成与通知</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton type="button" tooltip="系统设置">
                  <Settings2 />
                  <span>系统设置</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="演示用户">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">
                演
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">演示用户</span>
                <span className="truncate text-xs text-muted-foreground">
                  优化师 · 在线
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function OfficialSiteHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-1 h-4" />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">投放运营</span>
          <span className="text-muted-foreground">/</span>
          <strong className="font-medium">工作台</strong>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="global-search">
            <Search />
            <span>搜索任务、账户或报告</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="sync-status">
            <i />
            数据已同步
          </div>
          <ThemeToggle />
          <Button variant="ghost" size="icon-sm" aria-label="通知">
            <Bell />
            <span className="notification-dot" />
          </Button>
          <Button
            className="avatar-button"
            variant="ghost"
            size="icon-sm"
            aria-label="个人中心"
          >
            <CircleUserRound />
          </Button>
        </div>
      </div>
    </header>
  );
}

export function SidebarShell() {
  return (
    <SidebarProvider>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <ProductSidebar />
      <SidebarInset>
        <OfficialSiteHeader />
        <DashboardContent variant="sidebar" />
      </SidebarInset>
    </SidebarProvider>
  );
}
