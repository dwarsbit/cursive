# @cursive/editor

The block editor that Cursive and Binder share, so a note opens the same
in both apps. Every block reads from and writes to Markdown.

It holds the document model (`editor/extensions.ts` and the blocks it
lists), the editor and its menus and node views (`components/`),
references and citations (`references/`), the tutorial blocks
(`tutorial/`), and the page file, properties, links and search helpers
they rest on (`lib/`).

## Use it in an app

The package is not published. Cursive uses it from this workspace;
another app installs it from GitHub, pinned to a commit:

```json
"@cursive/editor": "github:dwarsbit/cursive#<commit>&path:packages/editor"
```

Import a module by its path under `src`, without the extension:

```ts
import { Editor } from "@cursive/editor/components/Editor";
import { readPage, writePage } from "@cursive/editor/lib/page-file";
```

The styles come in two files. Import both after Tailwind, then set the
app's tint by overriding `--tint`, `--tint-foreground`, `--tint-soft`
and `--tint-edge` (and `--primary` and `--ring`):

```css
@import "tailwindcss";
@import "@cursive/editor/tokens.css";
@import "@cursive/editor/editor.css";
```

The package ships its TypeScript sources: the app's bundler compiles
them. In the desktop app, citations from Zotero and BibTeX call the
Tauri commands `zotero_local_fetch`, `zotero_key_get`, `zotero_key_set`,
`zotero_key_delete` and `bibtex_read`, so an app that uses them needs
those commands (Cursive's `src-tauri/src/zotero.rs`).

## Change it

A new block needs its Markdown form and a round-trip case in
`src/editor/markdown.test.ts`. Run `pnpm test` from the repository root:
it runs the package's tests with the app's. Once a change is on `main`,
move the commit another app pins to.
