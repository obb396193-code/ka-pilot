"use client";

import { Bot, Check, ChevronsUpDown, Crown, Gauge } from "lucide-react";

import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export type DashboardView = "optimizer" | "ka" | "executive";

const views = [
  { value: "optimizer" as const, label: "快手优化师", icon: Bot },
  { value: "ka" as const, label: "KA 负责人", icon: Crown },
  { value: "executive" as const, label: "综合首页", icon: Gauge },
];

export function TeamSwitcher({
  value,
  onValueChange,
}: {
  value: DashboardView;
  onValueChange: (value: DashboardView) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-label="切换工作视图"
          className="w-[180px] justify-between"
        >
          <span className="flex size-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Gauge className="size-3.5" />
          </span>
          <span className="truncate font-semibold">KA Pilot</span>
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[220px]" align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          工作视图
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {views.map((view) => {
            const Icon = view.icon;
            return (
              <DropdownMenuItem
                key={view.value}
                onSelect={() => onValueChange(view.value)}
              >
                <Icon />
                {view.label}
                <Check
                  className={
                    value === view.value
                      ? "ml-auto opacity-100"
                      : "ml-auto opacity-0"
                  }
                />
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
