import { Plus, Tag, Type, X } from "lucide-react";
import { useState } from "react";
import {
  formatProperties,
  parseProperties,
  propertyKey,
  propertyLabel,
  type Property,
} from "@/lib/properties";

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

/**
 * The page's properties under its title: the front matter of its
 * file, one row per line.
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
  const [name, setName] = useState("");
  const properties = parseProperties(raw);
  const shown = properties.filter((property) => property.kind !== "raw");

  const replace = (target: Property, next: Property | null) =>
    onChange(
      formatProperties(
        properties.flatMap((property) =>
          property === target ? (next ? [next] : []) : [property],
        ),
      ),
    );

  const addProperty = () => {
    const key = propertyKey(name);
    setAdding(false);
    setName("");
    if (!key || shown.some((property) => property.key === key)) return;
    // "tags" and other plural-looking names hold a list.
    const list = key === "tags" || key === "keywords" || key === "authors";
    onChange(
      formatProperties([
        ...properties,
        list ? { kind: "list", key, value: [] } : { kind: "text", key, value: "" },
      ]),
    );
  };

  return (
    <div className="props">
      {shown.length > 0 && (
        <dl>
          {shown.map((property) => {
            const label = propertyLabel(property.key);
            const Icon = property.kind === "list" ? Tag : Type;
            return (
              <div key={property.key} className="prop-row">
                <dt>
                  <Icon className="size-3.5 flex-none" aria-hidden />
                  <span className="truncate">{label}</span>
                </dt>
                <dd>
                  {property.kind === "list" ? (
                    <ListValue
                      label={label}
                      items={property.value}
                      onChange={(value) => replace(property, { ...property, value })}
                    />
                  ) : (
                    <input
                      value={property.value}
                      aria-label={label}
                      placeholder="Empty"
                      onChange={(event) =>
                        replace(property, { ...property, value: event.target.value })
                      }
                      className="prop-input flex-1"
                    />
                  )}
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
        <input
          autoFocus
          value={name}
          aria-label="Property name"
          placeholder="Property name"
          onChange={(event) => setName(event.target.value)}
          onBlur={addProperty}
          onKeyDown={(event) => {
            if (event.key === "Enter") addProperty();
            if (event.key === "Escape") {
              setAdding(false);
              setName("");
            }
          }}
          className="prop-input h-7 w-40 rounded border border-ring px-1.5"
        />
      ) : (
        <button type="button" className="prop-add" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" aria-hidden />
          Add property
        </button>
      )}
    </div>
  );
}
