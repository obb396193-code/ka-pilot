import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const primaryItems = [
  "工作台",
  "投放任务",
  "数据分析",
  "账户池",
  "自动化",
  "商品素材",
];

const moreItems = ["报告", "知识库", "集成与通知"];

export function MainNav({ className = "" }: { className?: string }) {
  return (
    <nav
      aria-label="产品主导航"
      className={`flex items-center space-x-4 lg:space-x-6 ${className}`}
    >
      {primaryItems.map((item, index) => (
        <a
          key={item}
          href="#"
          className={
            index === 0
              ? "text-sm font-medium transition-colors hover:text-primary"
              : "text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          }
        >
          {item}
        </a>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-primary data-[state=open]:text-primary">
          更多
          <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {moreItems.map((item, index) => (
            <div key={item}>
              {index === moreItems.length - 1 ? (
                <DropdownMenuSeparator />
              ) : null}
              <DropdownMenuItem>{item}</DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
