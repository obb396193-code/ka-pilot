import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarShell } from "./sidebar-shell";

describe("SidebarShell", () => {
  it("renders the sidebar information architecture without a layout switch", () => {
    const { container } = render(<SidebarShell />);
    expect(container.querySelector('[data-slot="sidebar"]')).not.toBeNull();
    expect(screen.getAllByText("工作台").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("自动化")).toBeInTheDocument();
    expect(screen.queryByText(/顶栏版|切换布局/)).not.toBeInTheDocument();
  });
});
