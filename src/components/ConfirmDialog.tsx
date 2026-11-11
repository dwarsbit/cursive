import { useEffect, useRef } from "react";

/** A question before something that can't be undone. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
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
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onCancel();
      }}
    >
      <div className="p-4">
        <h2 id="confirm-title" className="text-sm font-semibold">
          {title}
        </h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="h-8 rounded-md border bg-background px-3 text-[13px] font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 rounded-md bg-destructive/10 px-3 text-[13px] font-medium text-destructive hover:bg-destructive/20"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
