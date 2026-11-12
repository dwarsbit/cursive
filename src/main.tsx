import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SAMPLE_PAGE, SAMPLE_PROJECT } from "./editor/sample";
import { Desktop } from "./components/Desktop";
import { Web } from "./components/Web";
import { browserStore } from "./lib/browser-store";
import { isDesktop } from "./lib/desktop-store";
import "./index.css";

// The theme follows the system until the app has its own setting.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () =>
  document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

// The desktop app has its own menus: the webview's (Reload, Inspect
// Element) shows only in fields, for spelling and copy and paste, and
// in development.
if (isDesktop && import.meta.env.PROD) {
  window.addEventListener("contextmenu", (event) => {
    const target = event.target as Element | null;
    if (!target?.closest?.("input, textarea, [contenteditable='true'], .cm-editor")) {
      event.preventDefault();
    }
  });
}

// The desktop app keeps a project as a folder on disk. The web build
// (`pnpm build:web`) runs on the Polemic server and keeps projects in
// the account. Any other browser build is the demo, which keeps the
// sample project in the browser's own storage.
const app = isDesktop ? (
  <Desktop />
) : import.meta.env.MODE === "web" ? (
  <Web />
) : (
  <App store={browserStore(SAMPLE_PROJECT)} firstOpen={SAMPLE_PAGE} />
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{app}</React.StrictMode>,
);
