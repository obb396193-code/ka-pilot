import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CossDashboard } from "./coss-dashboard";

afterEach(cleanup);

describe("CossDashboard", () => {
  it("renders the independent COSS product dashboard with valid business fields", () => {
    const { container } = render(<CossDashboard />);

    expect(screen.getByText("COSS 产品版")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "COSS 产品导航" }),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll("[data-slot='card']").length,
    ).toBeGreaterThan(4);
    expect(container.querySelector("[data-slot='table']")).toBeInTheDocument();
    expect(screen.getByText("AAC 拉新")).toBeInTheDocument();
    expect(screen.queryByText(/支付|ROI/)).not.toBeInTheDocument();
  });

  it("filters tasks and opens the Agent panel", () => {
    render(<CossDashboard />);

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "aac_ptt_uv" },
    });
    expect(screen.getByText("闲鱼潜客转化")).toBeInTheDocument();
    expect(screen.queryByText("新建广告存活检查")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "投放 Agent" }));
    expect(
      screen.getByRole("complementary", { name: "投放 Agent 面板" }),
    ).toBeInTheDocument();
  });
});
