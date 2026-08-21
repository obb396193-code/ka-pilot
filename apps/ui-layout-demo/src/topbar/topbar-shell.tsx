import {
  Bell,
  Bot,
  ChartNoAxesCombined,
  ChevronRight,
  CircleUserRound,
  Database,
  FileChartColumn,
  FolderKanban,
  Library,
  Menu,
  Search,
  Shapes,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DashboardContent } from "@/shared/dashboard-content";
import { ThemeToggle } from "@/shared/theme-toggle";

const productLinks = [
  { label: "投放任务", detail: "计划、排期与执行状态", icon: FolderKanban },
  {
    label: "数据分析",
    detail: "趋势、归因与异常定位",
    icon: ChartNoAxesCombined,
  },
  { label: "账户池", detail: "账户、权限与健康状态", icon: Database },
];

const assetLinks = [
  { label: "商品素材", detail: "商品、创意与素材协作", icon: Shapes },
  { label: "报告中心", detail: "经营报告与定时分发", icon: FileChartColumn },
  { label: "知识库", detail: "策略、案例和工作规范", icon: Library },
];

function MenuCards({ items }: { items: typeof productLinks }) {
  return (
    <div className="nav-menu-grid">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavigationMenuLink key={item.label} href="#">
            <span className="nav-card-icon">
              <Icon />
            </span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </NavigationMenuLink>
        );
      })}
    </div>
  );
}

function DesktopProductNav() {
  return (
    <NavigationMenu className="desktop-product-nav" aria-label="产品主导航">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink className="top-level-link active" href="#">
            经营总览
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>投放经营</NavigationMenuTrigger>
          <NavigationMenuContent>
            <MenuCards items={productLinks} />
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink className="top-level-link" href="#">
            自动化
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>内容资产</NavigationMenuTrigger>
          <NavigationMenuContent>
            <MenuCards items={assetLinks} />
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function MobileProductNav() {
  return (
    <nav className="mobile-product-nav" aria-label="产品导航">
      <a className="active" href="#">
        <Sparkles />
        经营总览
        <ChevronRight />
      </a>
      {productLinks.concat(assetLinks).map((item) => {
        const Icon = item.icon;
        return (
          <a key={item.label} href="#">
            <Icon />
            {item.label}
            <ChevronRight />
          </a>
        );
      })}
      <a href="#">
        <Workflow />
        自动化
        <ChevronRight />
      </a>
    </nav>
  );
}

export function TopbarShell() {
  return (
    <div className="app-shell topbar-app">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="topbar-header">
        <div className="topbar-primary">
          <div className="topbar-brand">
            <span>
              <Sparkles />
            </span>
            <strong>投放 Agent</strong>
            <small>经营控制台</small>
          </div>
          <DesktopProductNav />
          <div className="topbar-actions">
            <button type="button" className="topbar-search">
              <Search />
              <span>全局搜索</span>
              <kbd>⌘ K</kbd>
            </button>
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
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  className="topbar-mobile-menu"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="打开导航"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetTitle>产品导航</SheetTitle>
                <SheetDescription>选择要进入的业务模块</SheetDescription>
                <MobileProductNav />
              </SheetContent>
            </Sheet>
          </div>
        </div>
        <div className="topbar-secondary">
          <nav aria-label="当前页面视图">
            <a className="active" href="#">
              我的工作
            </a>
            <a href="#">
              协作事项 <span>4</span>
            </a>
            <a href="#">管理视图</a>
          </nav>
          <div>
            <i />
            数据同步正常 <span>媒体 10:42 · 后端约延迟 8 分钟</span>
            <Button variant="ghost" size="sm">
              <Bot />
              Agent 在线
            </Button>
          </div>
        </div>
      </header>
      <DashboardContent variant="topbar" />
    </div>
  );
}
