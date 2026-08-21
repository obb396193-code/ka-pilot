import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./topbar.css";
import { TopbarShell } from "./topbar-shell";

document.documentElement.dataset.layout = "shadcn-topbar";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TopbarShell />
  </StrictMode>,
);
