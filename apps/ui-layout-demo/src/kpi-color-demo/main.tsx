import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/sidebar/shadcn.css";
import "./kpi-color-demo.css";
import { KpiColorDemo } from "./kpi-color-demo";

document.documentElement.dataset.layout = "kpi-color-demo";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <KpiColorDemo />
  </StrictMode>,
);
