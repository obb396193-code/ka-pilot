import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../index.css";
import { SidebarShell } from "./sidebar-shell";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SidebarShell />
  </StrictMode>,
);
