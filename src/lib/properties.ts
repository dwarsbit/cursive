/**
 * Page properties: the front matter's lines other than the title, as
 * the editor shows them. A value is text or a list of short texts
 * (`tags: [methods, survey]`). Lines the editor doesn't understand,
 * such as nested YAML, are kept as written and not shown.
 */
export type Property =
  | { kind: "text"; key: string; value: string }
  | { kind: "list"; key: string; value: string[] }
  | { kind: "raw"; line: string };

const KEY_LINE = /^([A-Za-z0-9_][\w .-]*?):(?:[ \t]+(.*))?$/;

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "string") return parsed;
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

/** Splits `a, "b, c", d` on the commas outside quotes. */
function splitList(inner: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const char of inner) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ",") {
      items.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  items.push(current);
  return items.map(unquote).filter((item) => item !== "");
}

function quote(value: string, inList: boolean): string {
  const plain =
    value !== "" &&
    value === value.trim() &&
    !/^[-?:,[\]{}#&*!|>'"%@`]/.test(value) &&
    !/: |:$| #|[\n\r\t"\\]/.test(value) &&
    !(inList && /[,[\]{}]/.test(value)) &&
    !/^(?:true|false|null|yes|no|on|off|~)$/i.test(value);
  return plain ? value : JSON.stringify(value);
}

export function parseProperties(raw: string): Property[] {
  if (!raw.trim()) return [];
  const lines = raw.split(/\r?\n/);
  const properties: Property[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = KEY_LINE.exec(line);
    const next = lines[i + 1] ?? "";
    // A key whose value sits on the indented lines under it is kept as written.
    if (!match || (match[2] === undefined && /^\s+\S/.test(next))) {
      properties.push({ kind: "raw", line });
      continue;
    }
    const key = match[1];
    const value = (match[2] ?? "").trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      properties.push({ kind: "list", key, value: splitList(value.slice(1, -1)) });
    } else if (/^[{|>&*!]/.test(value)) {
      properties.push({ kind: "raw", line });
    } else {
      properties.push({ kind: "text", key, value: unquote(value) });
    }
  }
  return properties;
}

export function formatProperties(properties: Property[]): string {
  return properties
    .map((property) => {
      if (property.kind === "raw") return property.line;
      if (property.kind === "list") {
        return `${property.key}: [${property.value.map((item) => quote(item, true)).join(", ")}]`;
      }
      return property.value === ""
        ? `${property.key}:`
        : `${property.key}: ${quote(property.value, false)}`;
    })
    .join("\n");
}

/** A property name as a label: "pilot-date" reads "Pilot date". */
export function propertyLabel(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A label as a property name: "Pilot date" is written "pilot-date". */
export function propertyKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
