/**
 * The looks a published site can take. The server holds each theme's
 * styles; here are their names and a few colors for the picker.
 */
export type SiteTheme =
  "default" | "journal" | "plum" | "blueprint" | "midnight" | "poster";

export interface SiteThemeInfo {
  id: SiteTheme;
  name: string;
  /** One line under the name in the picker. */
  hint: string;
  ground: string;
  ink: string;
  accent: string;
  /** The typeface of the sample, by kind: the app does not carry the themes' own. */
  font: string;
  weight: number;
  /** Corner of the sample's shapes, in px. */
  radius: number;
  /** A line around the sample's shapes. */
  outline?: string;
}

export const SITE_THEMES: SiteThemeInfo[] = [
  {
    id: "default",
    name: "Cursive",
    hint: "Rust on white",
    ground: "#ffffff",
    ink: "#1c1a1d",
    accent: "#9a4a1c",
    font: "inherit",
    weight: 700,
    radius: 4,
  },
  {
    id: "journal",
    name: "Journal",
    hint: "Serif, for long reads",
    ground: "#ffffff",
    ink: "#1a1714",
    accent: "#8a2432",
    font: 'Georgia, "Times New Roman", serif',
    weight: 500,
    radius: 0,
  },
  {
    id: "plum",
    name: "Plum",
    hint: "Polemic's own look",
    ground: "#f5f2f5",
    ink: "#0c090c",
    accent: "#623e64",
    font: "inherit",
    weight: 700,
    radius: 5,
  },
  {
    id: "blueprint",
    name: "Blueprint",
    hint: "Monospace and square",
    ground: "#ffffff",
    ink: "#111827",
    accent: "#1d4ed8",
    font: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    weight: 700,
    radius: 0,
    outline: "#111827",
  },
  {
    id: "midnight",
    name: "Midnight",
    hint: "Always dark",
    ground: "#0e1116",
    ink: "#e8eaed",
    accent: "#f2b544",
    font: "inherit",
    weight: 600,
    radius: 5,
  },
  {
    id: "poster",
    name: "Poster",
    hint: "Bold, for tutorials and talks",
    ground: "#ffd84d",
    ink: "#111111",
    accent: "#2b3fe0",
    font: "inherit",
    weight: 800,
    radius: 6,
    outline: "#111111",
  },
];

/** The theme a server names, or Cursive's own for a name this app does not know. */
export const siteThemeOf = (value: unknown): SiteTheme =>
  SITE_THEMES.find((theme) => theme.id === value)?.id ?? "default";
