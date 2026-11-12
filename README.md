# Cursive

A Markdown editor in the style of Notion. You write in a visual mode with no
Markdown syntax, switch to Markdown when you want the source, and publish a
project as a web page. A project is notes, a presentation or a tutorial.

Cursive is in early development: notes and presentations work, tutorials
are still to come. It shares its interface kit, account and server
with [Polemic](https://github.com/dwarsbit/polemic).

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
  moves to the trash.
- **Account and sync**: sign in to your Polemic account from the Account
  button, then sync the folder to your account. Changes travel both ways,
  also the ones you made offline, and two changes to the same page are both
  kept. On another computer, open the project from your account in an empty
  folder.
- **Publish**: the Publish button makes a site of the project's pages, at an
  address you choose under the server's sites address. Publish again to bring
  the site up to date, or unpublish it.
- **In the browser**: the Polemic server serves Cursive at `/cursive`, where
  you open and edit the projects in your account. Pages are saved to the
  account as you type.

- **Presentations**: the New presentation button in the sidebar makes a page
  that is a set of slides. The sidebar lists the slides as small pictures,
  where you add, delete and drag them. Each slide is a 16:9 page of blocks
  with a layout (title, title and content, big number or quote) and speaker
  notes. A slide that holds more than fits says so, and you split it in two
  or make its text smaller. Present shows the slides full screen; the arrow
  keys move between them. On a published site a presentation is a slide
  player.
- **A presentation's file**: a page with `type: presentation` in its front
  matter. Slides are separated by a divider (`---`); a slide's layout sits in
  a `slide` code block at its start and its notes in a `notes` code block, so
  other Markdown tools show the whole talk as one document.

Sync carries the pages, the `.md` files. An empty folder stays on the
computer it was made on.

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
pnpm dev:web      # the browser app as the server serves it, at /cursive/
pnpm build:web    # that app, built into dist-web
```

`pnpm dev` in a browser is a demo: it keeps a sample project in the browser's
own storage. `pnpm dev:web` needs a Polemic server on this computer
([polemic-server](https://github.com/dwarsbit/polemic-server)'s `pnpm dev:api`),
or the one `CURSIVE_SERVER` names, for `/api`; sign in on that server first.
The desktop app signs in to `https://app.polemicapp.com`; start it with
`CURSIVE_SERVER=http://localhost:3000` for a server on this computer.

- `src/editor`: the document model. `extensions.ts` lists the blocks,
  `blocks.ts` what the slash menu offers, `callout.ts` and `toggle.ts` the
  blocks Cursive adds with their Markdown form.
- `src/components`: the two editors and their menus.
- `src/lib/page-file.ts`: a page as a Markdown file with front matter.
- `src/lib/project.ts`: a project as a folder of pages, and the `ProjectStore`
  that keeps it. `browser-store.ts` is the store for the browser,
  `desktop-store.ts` the one for the desktop app.
- `src/lib/project-doc.ts`: a project as the server keeps it, one Yjs
  document in the layout of Polemic's projects. `server.ts` is the server's
  API, `link-sync.ts` the desktop app's sync of a folder with the account,
  `server-store.ts` the store for a project open in the browser.
- `src-tauri`: the desktop app. `src/project.rs` reads and writes the
  project's folder, `src/account.rs` signs in and sends the requests to the
  server, `src/link.rs` remembers which project a folder syncs with.
- `docker/web`: the image of the browser build, which the **Web image**
  workflow pushes to `ghcr.io/dwarsbit/cursive-web`.
- [docs/releasing.md](docs/releasing.md): how a release is made.
- `src/index.css`: the Polemic design tokens with Cursive's rust as the one
  tint, and the styles of the blocks.

## License

[GPL-3.0](LICENSE)
