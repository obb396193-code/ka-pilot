import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopbarShell } from "./topbar-shell";

describe("TopbarShell", () => {
  it("renders the complete historical shadcn topbar dashboard adaptation", () => {
    const { container } = render(<TopbarShell />);
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector(".topbar-primary")).toBeNull();
    expect(container.querySelector("[data-slot='card']")).toBeInTheDocument();
    expect(screen.getByText("KA Pilot")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "产品主导航" }),
    ).toBeInTheDocument();
    expect(screen.getByText("工作台")).toBeInTheDocument();
    expect(screen.getByText("投放任务")).toBeInTheDocument();
    expect(screen.getByText("更多")).toBeInTheDocument();
    expect(screen.getByText(/当前视图：快手优化师/)).toBeInTheDocument();
    expect(screen.getByText("投放经营总览")).toBeInTheDocument();
    expect(screen.getByText("今日消耗")).toBeInTheDocument();
    expect(screen.getByText("真实 CPA")).toBeInTheDocument();
    expect(screen.getByText("达标率")).toBeInTheDocument();
    expect(screen.getByText("待处理")).toBeInTheDocument();
    expect(screen.getByText("近 14 日消耗与真实 CPA")).toBeInTheDocument();
    expect(screen.queryByText("支付 ROI")).not.toBeInTheDocument();
    expect(screen.queryByText(/ROI/)).not.toBeInTheDocument();
    expect(screen.getByText("AAC 拉新")).toBeInTheDocument();
    expect(screen.getByText("新建广告存活检查")).toBeInTheDocument();
    expect(screen.getByText("近期投放任务")).toBeInTheDocument();
    expect(screen.queryByText(/侧栏版|切换布局/)).not.toBeInTheDocument();
  });
});
