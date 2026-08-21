import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { CossDashboard } from "./coss-dashboard";
import "./coss.css";

document.documentElement.dataset.layout = "coss-topbar";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CossDashboard />
  </StrictMode>,
);
