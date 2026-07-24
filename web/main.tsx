import React from "react";
import { createRoot } from "react-dom/client";

import { browserApi } from "./api.ts";
import { App } from "./app.tsx";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Dashboard root element is missing.");
}

createRoot(root).render(
  <React.StrictMode>
    <App api={browserApi} />
  </React.StrictMode>,
);
