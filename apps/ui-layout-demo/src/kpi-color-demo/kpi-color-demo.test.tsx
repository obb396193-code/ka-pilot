import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { KpiColorDemo } from "./kpi-color-demo";

afterEach(cleanup);

describe("KpiColorDemo", () => {
  it("defaults to the restrained business color option", () => {
    render(<KpiColorDemo />);

    expect(screen.getByTestId("kpi-color-demo")).toHaveAttribute(
      "data-color-mode",
      "balanced",
    );
    expect(
      screen.getByRole("button", { name: /B 克制业务色/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the four desensitized advertising metrics", () => {
    render(<KpiColorDemo />);

    expect(screen.getByText("今日消耗")).toBeInTheDocument();
    expect(screen.getByText("真实转化")).toBeInTheDocument();
    expect(screen.getByText("活跃账户")).toBeInTheDocument();
    expect(screen.getByText("成本达成率")).toBeInTheDocument();
    expect(screen.getByText("页面数据均为脱敏演示数据")).toBeInTheDocument();
  });

  it("switches between neutral, balanced, and vivid modes", () => {
    render(<KpiColorDemo />);
    const root = screen.getByTestId("kpi-color-demo");

    fireEvent.click(screen.getByRole("button", { name: /A 中性原版/ }));
    expect(root).toHaveAttribute("data-color-mode", "neutral");

    fireEvent.click(screen.getByRole("button", { name: /C 驾驶舱色/ }));
    expect(root).toHaveAttribute("data-color-mode", "vivid");
    expect(screen.getByText("色彩更突出，适合远距离扫视")).toBeInTheDocument();
  });
});
