# Notes for agents

- Every piece of user-facing text (interface strings, errors, docs, README, changelog) follows [CONTENT.md](CONTENT.md). It is Polemic's content style, copied from polemic; where it says Polemic, read Cursive.
- The interface follows the Polemic UI kit: the tokens in `packages/editor/src/tokens.css` (mauve grays, rust as the one tint), 28px rows, sentence case.
- Every block reads from and writes to Markdown. A new block needs its Markdown form and a round-trip case in `packages/editor/src/editor/markdown.test.ts`.
- The block editor is the package `packages/editor` (`@cursive/editor`), shared with Binder (dwarsbit/binder). Keep it free of Cursive's app code: it imports nothing from `src/`. See [its README](packages/editor/README.md).
- Every change, feature or bug fix adds its line to the `## X.Y.Z (unreleased)` section at the top of [CHANGELOG.md](CHANGELOG.md), in the same pull request. Changes the reader doesn't see (CI, refactors, tests) get no line.
- Releases are cut from that section by the Release workflow; see [docs/releasing.md](docs/releasing.md).
- Before you push: `pnpm lint`, `pnpm test` and `pnpm build`, and `cargo test` in `src-tauri` when you changed the desktop app.
