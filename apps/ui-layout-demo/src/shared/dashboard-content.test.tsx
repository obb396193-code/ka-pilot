import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardContent } from "./dashboard-content";

describe("DashboardContent", () => {
  it("switches business role without exposing a layout switch", () => {
    render(<DashboardContent variant="sidebar" />);
    expect(screen.getByText("先处理 3 个异常账户")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "KA 负责人" }));
    expect(screen.getByText(/目标完成 82.4%/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "综合首页" }));
    expect(screen.getByText(/经营态势稳定/)).toBeInTheDocument();
    expect(screen.queryByText(/切换到顶栏|切换到侧栏/)).not.toBeInTheDocument();
  });
});
