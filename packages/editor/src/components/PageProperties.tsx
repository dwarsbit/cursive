import {
  Calendar,
  CheckSquare,
  ExternalLink,
  Hash,
  Link,
  Plus,
  Tag,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "../lib/cn";
import { openExternal } from "../lib/platform";
import { ORDER_KEY } from "../lib/paths";
import { STYLE_KEY } from "../references/styles";
import {
  formatProperties,
  normalizeLink,
  parseProperties,
  propertyKey,
  propertyLabel,
  type Property,
  type PropertyKind,
} from "../lib/properties";

/** The kinds a new property can have, in the order the picker shows them. */
const KINDS: Array<{ kind: PropertyKind; label: string; icon: LucideIcon }> = [
  { kind: "text", label: "Text", icon: Type },
  { kind: "list", label: "List", icon: Tag },
  { kind: "date", label: "Date", icon: Calendar },
  { kind: "number", label: "Number", icon: Hash },
  { kind: "boolean", label: "Checkbox", icon: CheckSquare },
  { kind: "link", label: "Link", icon: Link },
];
const ICONS = Object.fromEntries(KINDS.map((k) => [k.kind, k.icon])) as Record<
  PropertyKind,
  LucideIcon
>;

/** A new property of a kind, empty. */
function emptyProperty(key: string, kind: PropertyKind): Property {
  if (kind === "list") return { kind, key, value: [] };
  if (kind === "boolean") return { kind, key, value: false };
  return { kind, key, value: "" };
}

/** The list's items as pills, with a field to add one. */
function ListValue({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const item = draft.trim();
    setDraft("");
    if (item && !items.includes(item)) onChange([...items, item]);
  };
  return (
    <>
      {items.map((item) => (
        <span key={item} className="pill">
          {item}
          <button
            type="button"
            aria-label={`Remove ${item}`}
            onClick={() => onChange(items.filter((other) => other !== item))}
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        value={draft}
        aria-label={`Add to ${label}`}
        placeholder={items.length ? "" : "Empty"}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={add}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add();
          } else if (event.key === "Backspace" && !draft && items.length) {
            onChange(items.slice(0, -1));
          }
        }}
        className="prop-input min-w-16 flex-1"
      />
    </>
  );
}

/** One property's value, edited in the field that fits its kind. */
function Value({
  property,
  label,
  onChange,
}: {
  property: Exclude<Property, { kind: "raw" }>;
  label: string;
  onChange: (next: Property) => void;
}) {
  switch (property.kind) {
    case "list":
      return (
        <ListValue
          label={label}
          items={property.value}
          onChange={(value) => onChange({ ...property, value })}
        />
      );
    case "boolean":
      return (
        <input
          type="checkbox"
          checked={property.value}
          aria-label={label}
          onChange={(event) => onChange({ ...property, value: event.target.checked })}
          className="prop-check"
        />
      );
    case "link":
      return (
        <>
          <input
            type="url"
            value={property.value}
            aria-label={label}
            placeholder="Empty"
            onChange={(event) => onChange({ ...property, value: event.target.value })}
            onBlur={(event) => {
              const value = normalizeLink(event.target.value);
              if (value !== property.value) onChange({ ...property, value });
            }}
            className="prop-input flex-1"
          />
          {/^https?:\/\/\S/i.test(property.value) && (
            <button
              type="button"
              className="prop-remove"
              aria-label={`Open ${label}`}
              title="Open in your browser"
              onClick={() => openExternal(property.value)}
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </button>
          )}
        </>
      );
    default:
      return (
        <input
          type={property.kind}
          inputMode={property.kind === "number" ? "decimal" : undefined}
          value={property.value}
          aria-label={label}
          placeholder="Empty"
          onChange={(event) => onChange({ ...property, value: event.target.value })}
          className={cn("prop-input", property.kind === "date" ? "w-36" : "flex-1")}
        />
      );
  }
}

/** The field for a new property's name, with the kinds to pick from. */
function NewProperty({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, kind: PropertyKind) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PropertyKind>("text");
  const box = useRef<HTMLDivElement>(null);
  const done = () => (name.trim() ? onAdd(name, kind) : onCancel());
  return (
    <div
      ref={box}
      className="flex flex-wrap items-center gap-2"
      // Leaving the name and the kinds adds the property.
      onBlur={(event) => {
        if (!box.current?.contains(event.relatedTarget as Node | null)) done();
      }}
    >
      <input
        autoFocus
        value={name}
        aria-label="Property name"
        placeholder="Property name"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") done();
          if (event.key === "Escape") onCancel();
        }}
        className="prop-input h-7 w-40 rounded border border-ring px-1.5"
      />
      <span role="radiogroup" aria-label="Kind" className="inline-flex gap-0.5">
        {KINDS.map((item) => (
          <button
            key={item.kind}
            type="button"
            role="radio"
            aria-checked={kind === item.kind}
            aria-label={item.label}
            title={item.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setKind(item.kind)}
            className={cn(
              "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
              kind === item.kind &&
                "bg-tint-soft text-tint-foreground hover:bg-tint-soft",
            )}
          >
            <item.icon className="size-3.5" aria-hidden />
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * The page's properties under its title: the front matter of its
 * file, one row per line. A page's place in its folder (`order`) is
 * kept there too, and not shown.
 */
export function PageProperties({
  raw,
  onChange,
}: {
  /** The front matter's lines other than the title. */
  raw: string;
  onChange: (raw: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  // An empty value reads as text: the kind it was given is kept here.
  const [kinds, setKinds] = useState<Record<string, PropertyKind>>({});
  const properties = parseProperties(raw).map((property): Property => {
    const wanted = property.kind === "text" ? kinds[property.key] : undefined;
    if (!wanted || wanted === "text" || property.kind !== "text") return property;
    if (wanted === "list")
      return property.value ? property : { ...property, kind: "list", value: [] };
    if (wanted === "boolean") return property;
    return { ...property, kind: wanted };
  });
  const shown = properties.filter(
    // The order is the sidebar's, the citation style the reference list's.
    (property) =>
      property.kind !== "raw" && property.key !== ORDER_KEY && property.key !== STYLE_KEY,
  );

  const replace = (target: Property, next: Property | null) =>
    onChange(
      formatProperties(
        properties.flatMap((property) =>
          property === target ? (next ? [next] : []) : [property],
        ),
      ),
    );

  const addProperty = (name: string, kind: PropertyKind) => {
    const key = propertyKey(name);
    setAdding(false);
    if (!key || properties.some((p) => p.kind !== "raw" && p.key === key)) return;
    setKinds((known) => ({ ...known, [key]: kind }));
    onChange(formatProperties([...properties, emptyProperty(key, kind)]));
  };

  return (
    <div className="props">
      {shown.length > 0 && (
        <dl>
          {shown.map((property) => {
            if (property.kind === "raw") return null;
            const label = propertyLabel(property.key);
            const Icon = ICONS[property.kind];
            return (
              <div key={property.key} className="prop-row">
                <dt>
                  <Icon className="size-3.5 flex-none" aria-hidden />
                  <span className="truncate">{label}</span>
                </dt>
                <dd>
                  <Value
                    property={property}
                    label={label}
                    onChange={(next) => replace(property, next)}
                  />
                  <button
                    type="button"
                    className="prop-remove"
                    aria-label={`Remove ${label}`}
                    title={`Remove ${label}`}
                    onClick={() => replace(property, null)}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {adding ? (
        <NewProperty onAdd={addProperty} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" className="prop-add" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" aria-hidden />
          Add property
        </button>
      )}
    </div>
  );
}
