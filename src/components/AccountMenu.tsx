import { ExternalLink, LogOut, RefreshCw, RefreshCwOff, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@cursive/editor/lib/cn";
import type { Account } from "@/lib/server";
import { messageOf } from "@cursive/editor/components/Dialog";

/** First and last name as two letters: "Anna de Vries" is AV. */
function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => [...word][0] ?? "")
    .filter((letter) => /\p{L}|\p{N}/u.test(letter));
  const picked =
    letters.length > 2 ? [letters[0], letters[letters.length - 1]] : letters;
  return picked.join("").toUpperCase();
}

export function Avatar({ name, large }: { name?: string; large?: boolean }) {
  const initials = name ? initialsOf(name) : "";
  return (
    <span
      aria-hidden
      className={cn(
        "grid flex-none place-items-center rounded-full font-semibold",
        large ? "size-9 text-[13px]" : "size-6 text-[10px]",
        initials
          ? "bg-primary-fill text-primary-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {initials || <UserRound className={large ? "size-4" : "size-3.5"} />}
    </span>
  );
}

const ITEM =
  "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent disabled:opacity-50 [&>svg]:size-3.5 [&>svg]:flex-none [&>svg]:text-muted-foreground";

/**
 * The signed-in account at the end of the header: the avatar opens who
 * is signed in, whether the open project syncs, the account page and
 * Sign out.
 */
export function AccountMenu({
  account,
  linked,
  onLink,
  onUnlink,
  onManage,
  onSignOut,
}: {
  /** The signed-in account; null while its name can't be fetched. */
  account: Account | null;
  /** Whether the open project syncs with the account. */
  linked: boolean;
  onLink: () => Promise<void>;
  onUnlink: () => Promise<void>;
  onManage: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
      } else if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  /** Runs a menu item's work. The menu closes when it worked, and says why when it didn't. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      setOpen(false);
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={root} className="relative flex-none">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Polemic account"
        title={account ? `${account.name} (${account.email})` : "Polemic account"}
        onClick={() => {
          setProblem(null);
          setOpen(!open);
        }}
        className="block rounded-full"
      >
        <Avatar name={account?.name} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Polemic account"
          className="popover absolute top-full right-0 z-20 mt-1.5 w-72 p-1 text-[13px]"
        >
          <div className="flex items-center gap-3 px-2 pt-2 pb-3">
            <Avatar name={account?.name} large />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{account?.name ?? "Signed in"}</p>
              {account && (
                <p className="truncate text-xs text-muted-foreground">
                  {account.email}
                </p>
              )}
            </div>
          </div>
          <div className="border-t px-2 pt-2 pb-1 text-xs text-muted-foreground">
            {linked
              ? "This project syncs with your account."
              : "This project is only on this computer."}
          </div>
          {linked ? (
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              disabled={busy}
              onClick={() => void run(onUnlink)}
            >
              <RefreshCwOff aria-hidden />
              Stop syncing this project
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              disabled={busy}
              onClick={() => void run(onLink)}
            >
              <RefreshCw aria-hidden />
              Sync this project to your account
            </button>
          )}
          {problem && (
            <p className="px-2 py-1 text-xs text-destructive" role="alert">
              {problem}
            </p>
          )}
          <div className="my-1 border-t" />
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={() => {
              onManage();
              setOpen(false);
            }}
          >
            <UserRound aria-hidden />
            <span className="flex-1">Manage account</span>
            <ExternalLink aria-hidden />
          </button>
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            disabled={busy}
            onClick={() => void run(onSignOut)}
          >
            <LogOut aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
