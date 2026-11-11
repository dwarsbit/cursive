import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SAMPLE_PAGE, SAMPLE_PROJECT } from "./editor/sample";
import { browserStore } from "./lib/browser-store";
import "./index.css";

// The theme follows the system until the app has its own setting.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () =>
  document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

// The browser keeps the project until projects are folders on disk.
const store = browserStore(SAMPLE_PROJECT);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App store={store} firstOpen={SAMPLE_PAGE} />
  </React.StrictMode>,
);
