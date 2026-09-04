import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/sidebar/shadcn.css";
import "./kpi-component-demo.css";
import { KpiComponentDemo } from "./kpi-component-demo";

document.documentElement.dataset.layout = "kpi-component-demo";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <KpiComponentDemo />
  </StrictMode>,
);
