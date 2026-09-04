import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { KpiComponentDemo } from "./kpi-component-demo";

afterEach(cleanup);

describe("KpiComponentDemo", () => {
  it("defaults to the complete Tremor KPI block comparison", () => {
    render(<KpiComponentDemo />);

    expect(screen.getByTestId("kpi-component-demo")).toHaveAttribute(
      "data-component-mode",
      "tremor-block",
    );
    expect(
      screen.getByRole("button", { name: /B Tremor KPI Block/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows all advertising metrics using Tremor Raw components", () => {
    const { container } = render(<KpiComponentDemo />);

    expect(screen.getByText("今日消耗")).toBeInTheDocument();
    expect(screen.getByText("真实转化")).toBeInTheDocument();
    expect(screen.getByText("活跃账户")).toBeInTheDocument();
    expect(screen.getByText("成本达成率")).toBeInTheDocument();
    expect(
      container.querySelectorAll('[tremor-id="tremor-raw"]').length,
    ).toBeGreaterThan(4);
  });

  it("switches among current shadcn, Tremor block, and matched Tremor components", () => {
    render(<KpiComponentDemo />);
    const root = screen.getByTestId("kpi-component-demo");

    fireEvent.click(screen.getByRole("button", { name: /A 当前 shadcn/ }));
    expect(root).toHaveAttribute("data-component-mode", "shadcn");
    expect(screen.getAllByText("当前官方 SectionCards")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /C Tremor 功能组合/ }));
    expect(root).toHaveAttribute("data-component-mode", "tremor-matched");
    expect(screen.getAllByText("每种指标使用不同的数据组件")).toHaveLength(2);
  });
});
