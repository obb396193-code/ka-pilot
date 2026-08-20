import {
  Bell,
  Blocks,
  Bot,
  ChartNoAxesCombined,
  ChevronLeft,
  CircleUserRound,
  Database,
  FileChartColumn,
  FolderKanban,
  LayoutDashboard,
  Library,
  Menu,
  Search,
  Settings2,
  Shapes,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DashboardContent } from "@/shared/dashboard-content";
import { ThemeToggle } from "@/shared/theme-toggle";

const primaryItems = [
  { label: "工作台", icon: LayoutDashboard, active: true },
  { label: "投放任务", icon: FolderKanban },
  { label: "数据分析", icon: ChartNoAxesCombined },
  { label: "账户资源", icon: Database },
  { label: "自动化", icon: Workflow },
];

const resourceItems = [
  { label: "商品素材", icon: Shapes },
  { label: "报告中心", icon: FileChartColumn },
  { label: "知识库", icon: Library },
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="sidebar-brand">
      <span className="brand-mark">
        <Sparkles />
      </span>
      {!compact && (
        <div>
          <strong>投放 Agent</strong>
          <span>运营工作台</span>
        </div>
      )}
    </div>
  );
}

function Navigation({ compact = false }: { compact?: boolean }) {
  return (
    <nav className="sidebar-nav" aria-label="主导航">
      <div className="nav-group">
        {!compact && <p>经营与执行</p>}
        {primaryItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.label}
              className={item.active ? "active" : ""}
              aria-current={item.active ? "page" : undefined}
              title={compact ? item.label : undefined}
            >
              <Icon />
              {!compact && <span>{item.label}</span>}
              {item.label === "自动化" && !compact && (
                <Badge tone="info">3</Badge>
              )}
            </button>
          );
        })}
      </div>
      <div className="nav-group">
        {!compact && <p>资产与沉淀</p>}
        {resourceItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.label}
              title={compact ? item.label : undefined}
            >
              <Icon />
              {!compact && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function SidebarRail({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <Brand compact={compact} />
      <Navigation compact={compact} />
      <div className="sidebar-bottom">
        <button type="button" title={compact ? "集成与通知" : undefined}>
          <Blocks />
          {!compact && <span>集成与通知</span>}
        </button>
        <button type="button" title={compact ? "系统设置" : undefined}>
          <Settings2 />
          {!compact && <span>系统设置</span>}
        </button>
        <div className="sidebar-user">
          <span>演</span>
          {!compact && (
            <div>
              <strong>演示用户</strong>
              <small>优化师 · 在线</small>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function SidebarShell() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={`app-shell sidebar-app ${collapsed ? "is-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <aside className="desktop-sidebar">
        <SidebarRail compact={collapsed} />
        <button
          className="collapse-control"
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          onClick={() => setCollapsed((value) => !value)}
        >
          <ChevronLeft />
        </button>
      </aside>
      <div className="sidebar-workspace">
        <header className="sidebar-header">
          <div className="header-leading">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  className="mobile-menu-button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="打开导航"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="mobile-nav-sheet">
                <SheetTitle className="sr-only">主导航</SheetTitle>
                <SheetDescription className="sr-only">
                  投放 Agent 产品导航
                </SheetDescription>
                <SidebarRail />
              </SheetContent>
            </Sheet>
            <div className="breadcrumb">
              <span>投放运营</span>
              <b>/</b>
              <strong>工作台</strong>
            </div>
          </div>
          <div className="header-actions">
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
        </header>
        <DashboardContent variant="sidebar" />
      </div>
    </div>
  );
}
