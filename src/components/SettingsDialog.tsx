import { Boxes, Cloud, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isDesktop } from "@/lib/desktop-store";
import { cn } from "@/lib/cn";
import { removeSource, saveSource, sourceName, useSources } from "@/references/sources";
import {
  checkZoteroKey,
  zoteroAppAnswers,
  type ZoteroSource,
} from "@/references/zotero";
import { BUTTON, Dialog, PRIMARY_BUTTON, QUIET_BUTTON } from "./Dialog";

type Status = "checking" | "ok" | "error" | "off";

/** The dot next to a source: pulsing while it is checked, gray while it is off. */
function Dot({ status }: { status: Status }) {
  const color =
    status === "ok"
      ? "bg-success"
      : status === "error"
        ? "bg-destructive"
        : status === "off"
          ? "bg-muted-foreground/40"
          : "bg-muted-foreground/60";
  return (
    <span className="relative flex size-2 flex-none" aria-hidden>
      {status === "checking" && (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-60",
            color,
          )}
        />
      )}
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}

async function probe(source: ZoteroSource): Promise<Status> {
  if (source.kind === "app") return (await zoteroAppAnswers()) ? "ok" : "error";
  if (!source.userId || !source.apiKey) return "error";
  return (await checkZoteroKey(source.apiKey)) ? "ok" : "error";
}

function subtitle(source: ZoteroSource, status: Status): string {
  if (!source.enabled) return "Off";
  if (source.kind === "app") {
    if (!isDesktop) return "Only the desktop app can reach the Zotero app.";
    if (status === "checking") return "Checking…";
    if (status === "ok") return "Connected";
    return "Not found. Open Zotero and turn on “Allow other applications on this computer to communicate with Zotero” in its Advanced settings.";
  }
  if (!source.userId || !source.apiKey) return "Not connected";
  if (status === "checking") return `Checking · User ${source.userId}`;
  if (status === "ok") return `Connected · User ${source.userId}`;
  return "Zotero turned the key down. Check the API key.";
}

const ICON =
  "grid size-6 flex-none place-items-center rounded-[5px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 [&>svg]:size-3.5";

/**
 * Where citing searches: the Zotero app on this computer and libraries
 * at zotero.org, as Polemic's Sources settings have them. Each row
 * says whether its connection works.
 */
function ZoteroSources() {
  const sources = useSources();
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [editing, setEditing] = useState<ZoteroSource | "new" | null>(null);
  const [adding, setAdding] = useState(false);

  const check = useCallback(async (source: ZoteroSource) => {
    setStatuses((prev) => ({ ...prev, [source.id]: "checking" }));
    const status = await probe(source);
    setStatuses((prev) => ({ ...prev, [source.id]: status }));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      for (const source of sources) if (source.enabled) void check(source);
    }, 0);
    return () => clearTimeout(timer);
  }, [sources, check]);

  const hasApp = sources.some((source) => source.kind === "app");

  return (
    <section>
      <h3 className="text-[13px] font-medium">Zotero</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Type @ in a page to cite a work from these libraries. The page keeps its own
        copy of each work, so it reads without Zotero, and says when a work changed
        there.
      </p>
      {sources.length > 0 && (
        <ul className="mt-2 divide-y border-y">
          {sources.map((source) => {
            const status: Status = source.enabled
              ? (statuses[source.id] ?? "checking")
              : "off";
            const Icon = source.kind === "app" ? Boxes : Cloud;
            return (
              <li key={source.id} className="flex items-center gap-2.5 py-2">
                <span className="grid size-7 flex-none place-items-center rounded-md bg-accent">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium">
                    <Dot status={status} />
                    {sourceName(source)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {subtitle(source, status)}
                  </p>
                </div>
                <button
                  type="button"
                  className={ICON}
                  title="Check the connection again"
                  aria-label="Check the connection again"
                  disabled={!source.enabled || status === "checking"}
                  onClick={() => void check(source)}
                >
                  <RefreshCw
                    className={cn(status === "checking" && "animate-spin")}
                    aria-hidden
                  />
                </button>
                {source.kind === "cloud" && (
                  <button
                    type="button"
                    className={ICON}
                    title="Edit"
                    aria-label="Edit"
                    onClick={() => setEditing(source)}
                  >
                    <Pencil aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  className={ICON}
                  title="Remove"
                  aria-label="Remove"
                  onClick={() => void removeSource(source.id)}
                >
                  <Trash2 aria-hidden />
                </button>
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--tint)]"
                  checked={source.enabled}
                  title="Search this library when citing"
                  aria-label={`Search ${sourceName(source)} when citing`}
                  onChange={(event) =>
                    void saveSource({ ...source, enabled: event.target.checked })
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      <div className="relative mt-3">
        <button
          type="button"
          className={cn(BUTTON, "inline-flex items-center gap-1.5")}
          onClick={() => setAdding(!adding)}
        >
          <Plus className="size-3.5" aria-hidden />
          Add Zotero
        </button>
        {adding && (
          <div
            role="menu"
            className="popover absolute top-full left-0 z-20 mt-1 w-56 p-1 text-[13px]"
          >
            {isDesktop && (
              <button
                type="button"
                role="menuitem"
                disabled={hasApp}
                title={hasApp ? "The Zotero app is in the list already" : undefined}
                className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent disabled:opacity-50"
                onClick={() => {
                  setAdding(false);
                  void saveSource({
                    id: crypto.randomUUID(),
                    kind: "app",
                    enabled: true,
                  });
                }}
              >
                <Boxes className="size-3.5 text-muted-foreground" aria-hidden />
                Zotero app on this computer
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent"
              onClick={() => {
                setAdding(false);
                setEditing("new");
              }}
            >
              <Cloud className="size-3.5 text-muted-foreground" aria-hidden />
              Zotero cloud…
            </button>
          </div>
        )}
      </div>
      {editing && (
        <ZoteroCloudForm
          source={
            editing === "new"
              ? null
              : (editing as Extract<ZoteroSource, { kind: "cloud" }>)
          }
          onDone={() => setEditing(null)}
        />
      )}
    </section>
  );
}

/** Adds or edits a library at zotero.org: an API key, which also gives the user ID. */
function ZoteroCloudForm({
  source,
  onDone,
}: {
  source: Extract<ZoteroSource, { kind: "cloud" }> | null;
  onDone: () => void;
}) {
  const [label, setLabel] = useState(source?.label ?? "");
  const [apiKey, setApiKey] = useState(source?.apiKey ?? "");
  const [userId, setUserId] = useState(source?.userId ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const keyField = useRef<HTMLInputElement>(null);
  useEffect(() => keyField.current?.focus(), []);

  const validate = async () => {
    setBusy(true);
    setNote(null);
    const result = await checkZoteroKey(apiKey);
    setBusy(false);
    if (!result) {
      setNote({
        text: "The key couldn't be checked. Check it and your connection.",
        bad: true,
      });
      return;
    }
    setUserId(result.userId);
    setNote({
      text: result.username
        ? `The key works, for ${result.username}.`
        : "The key works.",
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveSource({
        id: source?.id ?? crypto.randomUUID(),
        kind: "cloud",
        enabled: source?.enabled ?? true,
        label: label.trim(),
        userId: userId.trim(),
        apiKey: apiKey.trim(),
      });
      onDone();
    } catch (error) {
      setNote({
        text: error instanceof Error ? error.message : String(error),
        bad: true,
      });
      setBusy(false);
    }
  };

  const field =
    "h-7 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-tint-edge";
  return (
    <div className="mt-3 rounded-lg border p-3">
      <p className="text-[13px] font-medium">
        {source ? "Edit Zotero cloud" : "Add Zotero cloud"}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Make a key at zotero.org/settings/keys that may read your library, and paste it
        here. The user ID fills itself in.
        {isDesktop
          ? " The key is kept in your system's credential store."
          : " The key is kept in this browser."}
      </p>
      <label className="mt-2.5 block text-xs text-muted-foreground">
        Name
        <input
          className={cn(field, "mt-1 text-foreground")}
          placeholder="Work library"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label className="mt-2 block text-xs text-muted-foreground">
        API key
        <span className="mt-1 flex gap-1.5">
          <input
            ref={keyField}
            className={cn(field, "font-mono text-foreground")}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            className="h-7 flex-none rounded-md border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            disabled={!apiKey.trim() || busy}
            onClick={() => void validate()}
          >
            {busy ? (
              <Loader2 className="size-3 animate-spin" aria-label="Checking" />
            ) : (
              "Check key"
            )}
          </button>
        </span>
      </label>
      <label className="mt-2 block text-xs text-muted-foreground">
        User ID
        <input
          className={cn(field, "mt-1 text-foreground")}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
      </label>
      {note && (
        <p
          className={cn(
            "mt-2 text-xs",
            note.bad ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {note.text}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className={QUIET_BUTTON} onClick={onDone}>
          Cancel
        </button>
        <button
          type="button"
          className={PRIMARY_BUTTON}
          disabled={!userId.trim() || !apiKey.trim() || busy}
          onClick={() => void save()}
        >
          Save
        </button>
      </div>
    </div>
  );
}

/** The app's settings. Today: where citations come from. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="settings mt-3">
        <h2 className="mb-2 text-xs font-medium text-muted-foreground">References</h2>
        <ZoteroSources />
        <p className="mt-4 text-xs text-muted-foreground">
          Citations and the reference list are in APA style.
        </p>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className={BUTTON} onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
