import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SAMPLE_PAGE, SAMPLE_PROJECT } from "./editor/sample";
import { Desktop } from "./components/Desktop";
import { browserStore } from "./lib/browser-store";
import { isDesktop } from "./lib/desktop-store";
import "./index.css";

// The theme follows the system until the app has its own setting.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () =>
  document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

// The desktop app keeps a project as a folder on disk; the browser
// build keeps one in its own storage until projects sync with an account.
const app = isDesktop ? (
  <Desktop />
) : (
  <App store={browserStore(SAMPLE_PROJECT)} firstOpen={SAMPLE_PAGE} />
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{app}</React.StrictMode>,
);
