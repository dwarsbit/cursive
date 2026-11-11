import { useEffect, useRef } from "react";

/** A dialog over the app, closed with Escape or a click outside it. */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="p-4">
        <h2 id="dialog-title" className="text-sm font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

export const BUTTON =
  "h-8 rounded-md border bg-background px-3 text-[13px] font-medium hover:bg-muted disabled:opacity-50";
export const PRIMARY_BUTTON =
  "h-8 rounded-md border border-primary-edge bg-primary-fill px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary-fill/85 disabled:opacity-50";
export const QUIET_BUTTON =
  "h-8 rounded-md px-3 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";
export const HEADER_BUTTON =
  "h-6 flex-none rounded-[5px] border bg-background px-2.5 text-xs font-medium hover:bg-muted";

export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
