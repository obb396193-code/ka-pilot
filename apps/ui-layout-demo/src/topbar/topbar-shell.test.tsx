import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopbarShell } from "./topbar-shell";

describe("TopbarShell", () => {
  it("renders horizontal product navigation without a permanent sidebar", () => {
    const { container } = render(<TopbarShell />);
    expect(container.querySelector("aside")).toBeNull();
    expect(screen.getByText("经营总览")).toBeInTheDocument();
    expect(screen.getByText("投放任务")).toBeInTheDocument();
    expect(screen.queryByText(/侧栏版|切换布局/)).not.toBeInTheDocument();
  });
});
