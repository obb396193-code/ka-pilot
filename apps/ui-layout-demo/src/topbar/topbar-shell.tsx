"use client";

import * as React from "react";

import { DashboardPage } from "./shadcn-dashboard/dashboard-page";
import { MainNav } from "./shadcn-dashboard/main-nav";
import { Search } from "./shadcn-dashboard/search";
import {
  TeamSwitcher,
  type DashboardView,
} from "./shadcn-dashboard/team-switcher";
import { UserNav } from "./shadcn-dashboard/user-nav";

export function TopbarShell() {
  const [view, setView] = React.useState<DashboardView>("optimizer");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground md:flex">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
        href="#main-content"
      >
        跳到主要内容
      </a>
      <header className="border-b">
        <div className="flex h-16 items-center px-4">
          <TeamSwitcher value={view} onValueChange={setView} />
          <MainNav className="mx-6" />
          <div className="ml-auto flex items-center space-x-4">
            <Search />
            <UserNav />
          </div>
        </div>
      </header>
      <main id="main-content">
        <DashboardPage view={view} />
      </main>
    </div>
  );
}
