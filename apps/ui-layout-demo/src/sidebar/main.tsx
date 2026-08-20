import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../index.css";
import { SidebarShell } from "./sidebar-shell";

document.documentElement.dataset.layout = "shadcn";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SidebarShell />
  </StrictMode>,
);
