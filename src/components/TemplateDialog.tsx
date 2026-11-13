import { TEMPLATE_KINDS, TEMPLATES, type Template } from "@/templates";
import { BUTTON, Dialog } from "@cursive/editor/components/Dialog";

/** The project templates by kind. Picking one makes the project. */
export function TemplateDialog({
  busy,
  problem,
  onPick,
  onClose,
}: {
  busy: boolean;
  /** Why the last pick didn't make a project. */
  problem: string | null;
  onPick: (template: Template) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="Start from a template" onClose={onClose}>
      <p className="mt-1 text-xs text-muted-foreground">
        A template fills a new project with pages to write in. Change or delete any of
        them.
      </p>
      <div className="-mx-1 mt-2 max-h-[60vh] overflow-y-auto px-1">
        {TEMPLATE_KINDS.map((kind) => (
          <section key={kind.id} aria-label={kind.label}>
            <h3 className="mt-3 mb-1 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
              {kind.label}
            </h3>
            <ul className="space-y-0.5">
              {TEMPLATES.filter((template) => template.kind === kind.id).map(
                (template) => (
                  <li key={template.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onPick(template)}
                      className="-mx-1 block w-[calc(100%+0.5rem)] rounded-md px-2.5 py-1.5 text-left hover:bg-muted disabled:opacity-50"
                    >
                      <span className="block text-[13px] font-medium">
                        {template.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {template.description}
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          </section>
        ))}
      </div>
      {problem && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {problem}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <button type="button" className={BUTTON} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
