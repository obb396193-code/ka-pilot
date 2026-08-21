import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarShell } from "./sidebar-shell";

describe("SidebarShell", () => {
  it("renders the official dashboard-01 block with adapted business content", () => {
    const { container } = render(<SidebarShell />);
    expect(container.querySelector('[data-slot="sidebar"]')).not.toBeNull();
    expect(screen.getByText("KA Pilot")).toBeInTheDocument();
    expect(screen.getAllByText("工作台").length).toBeGreaterThanOrEqual(1);
    for (const item of [
      "投放任务",
      "数据分析",
      "账户池",
      "自动化",
      "商品素材",
      "报告",
      "知识库",
      "集成与通知",
    ]) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(screen.queryByText("团队协作")).not.toBeInTheDocument();
    expect(screen.getByText("更多")).toBeInTheDocument();
    expect(screen.getByText("快手优化师")).toBeInTheDocument();
    expect(screen.getByText("投放经营工作台")).toBeInTheDocument();
    expect(screen.getByText("今日消耗")).toBeInTheDocument();
    expect(screen.getByText("近 90 日转化趋势")).toBeInTheDocument();
    expect(screen.getAllByText("任务概览").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/顶栏版|切换布局/)).not.toBeInTheDocument();
  });
});
