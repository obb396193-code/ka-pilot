import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarShell } from "./sidebar-shell";

describe("SidebarShell", () => {
  it("renders the official dashboard-01 block with adapted business content", () => {
    const { container } = render(<SidebarShell />);
    expect(container.querySelector('[data-slot="sidebar"]')).not.toBeNull();
    expect(screen.getAllByText("工作台").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("投放经营工作台")).toBeInTheDocument();
    expect(screen.getByText("今日消耗")).toBeInTheDocument();
    expect(screen.getByText("近 90 日转化趋势")).toBeInTheDocument();
    expect(screen.getAllByText("任务概览").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/顶栏版|切换布局/)).not.toBeInTheDocument();
  });
});
