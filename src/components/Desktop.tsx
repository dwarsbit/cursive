import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import App from "@/App";
import { desktopStore } from "@/lib/desktop-store";
import { loadFolder, saveFolder } from "@/lib/prefs";

/**
 * The desktop app: a project is a folder on disk. Shows the folder
 * that was open last, or asks for one.
 */
export function Desktop() {
  const [folder, setFolder] = useState(loadFolder);
  const store = useMemo(() => (folder ? desktopStore(folder) : null), [folder]);

  // Pages still waiting to be written are written before the window closes.
  useEffect(() => {
    if (!store) return;
    const onHide = () => void store.flush().catch(() => {});
    window.addEventListener("pagehide", onHide);
    window.addEventListener("blur", onHide);
    return () => {
      onHide();
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("blur", onHide);
    };
  }, [store]);

  const choose = async () => {
    const picked = await open({ directory: true, title: "Open a folder as a project" });
    if (typeof picked !== "string") return;
    saveFolder(picked);
    setFolder(picked);
  };

  if (!store) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-sm text-center">
          <span
            aria-hidden
            className="mx-auto grid size-12 place-items-center rounded-xl bg-primary-fill font-serif text-3xl font-semibold text-primary-foreground italic shadow-[inset_0_0_0_1px_var(--primary-edge)]"
          >
            C
          </span>
          <h1 className="mt-4 text-lg font-semibold">Open a folder to start</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            A project is a folder of Markdown files. Choose one you already have, or an
            empty folder for a new project.
          </p>
          <button
            type="button"
            onClick={() => void choose()}
            className="mt-4 h-8 rounded-md border border-primary-edge bg-primary-fill px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary-fill/85"
          >
            Open folder…
          </button>
        </div>
      </div>
    );
  }

  return <App key={folder} store={store} onSwitchProject={() => void choose()} />;
}
