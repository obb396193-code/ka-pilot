import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../index.css";
import { TopbarShell } from "./topbar-shell";

document.documentElement.dataset.layout = "coss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TopbarShell />
  </StrictMode>,
);
