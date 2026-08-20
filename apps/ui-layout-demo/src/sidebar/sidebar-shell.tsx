import type * as React from "react";
import {
  SidebarInset,
  SidebarProvider,
} from "@/sidebar/shadcn-dashboard/ui/sidebar";
import { AppSidebar } from "@/sidebar/shadcn-dashboard/app-sidebar";
import { ChartAreaInteractive } from "@/sidebar/shadcn-dashboard/chart-area-interactive";
import { DataTable } from "@/sidebar/shadcn-dashboard/data-table";
import { campaignRows } from "@/sidebar/shadcn-dashboard/demo-data";
import { SectionCards } from "@/sidebar/shadcn-dashboard/section-cards";
import { SiteHeader } from "@/sidebar/shadcn-dashboard/site-header";

export function SidebarShell() {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset id="main-content">
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <SectionCards />
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive />
              </div>
              <DataTable data={campaignRows} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
