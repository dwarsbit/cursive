# Cursive

A Markdown editor in the style of Notion. You write in a visual mode with no
Markdown syntax, switch to Markdown when you want the source, and publish a
project as a web page. A project is notes, a presentation or a tutorial.

Cursive is in early development and has no release yet. It shares its
interface kit, account and server with [Polemic](https://github.com/dwarsbit/polemic).

## What works today

- **Blocks**: text, three levels of heading, to-do, bulleted and numbered
  lists, toggle, quote, callout, table, code with syntax colors, equation
  and divider.
- **Slash menu**: type `/` on a new line or after a space, then a few letters
  to filter, and press Enter.
- **Selection toolbar**: select text for bold, italic, underline,
  strikethrough, inline code, highlight and link, or to turn the block into
  another one.
- **Block handle**: hover a block to add a block under it or drag it to
  another place.
- **Markdown underneath**: every block is read from and written to Markdown,
  so a page opens in any other Markdown tool. Callouts are quotes that open
  with `[!note]`, toggles are `<details>` elements and equations are TeX
  between `$$`.

- **Visual and Markdown mode**: switch with the buttons in the header or
  Cmd/Ctrl + /. Markdown mode shows the page as its file, with the title in
  the front matter.

- **Page tree**: a project is pages in folders. The sidebar lists them, and
  you add, open and delete pages and folders there. A page's file is named
  after its title.
- **Page properties**: the front matter of a page's file shows under its
  title, as text or as a list such as tags.

- **Desktop app**: open a folder on your computer as a project. Each page is
  a `.md` file in it, saved as you type, and a page or folder you delete
  moves to the trash. In the browser, the project is kept in the browser.

## Development

Cursive is a React app built with Vite, on Tiptap for the editor and Tailwind
for the styles. The desktop app is a Tauri shell around it. You need Node 22
and pnpm, and for the desktop app Rust and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm dev          # the browser app at http://localhost:1430
pnpm tauri dev    # the desktop app
pnpm test
pnpm lint
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

- `src/editor`: the document model. `extensions.ts` lists the blocks,
  `blocks.ts` what the slash menu offers, `callout.ts` and `toggle.ts` the
  blocks Cursive adds with their Markdown form.
- `src/components`: the two editors and their menus.
- `src/lib/page-file.ts`: a page as a Markdown file with front matter.
- `src/lib/project.ts`: a project as a folder of pages, and the `ProjectStore`
  that keeps it. `browser-store.ts` is the store for the browser,
  `desktop-store.ts` the one for the desktop app.
- `src-tauri`: the desktop app. `src/project.rs` reads and writes the
  project's folder.
- `src/index.css`: the Polemic design tokens with Cursive's indigo as the one
  tint, and the styles of the blocks.

## License

[GPL-3.0](LICENSE)
