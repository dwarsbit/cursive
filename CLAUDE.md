# Notes for agents

- Every piece of user-facing text (interface strings, errors, docs, README, changelog) follows [CONTENT.md](CONTENT.md). It is Polemic's content style, copied from polemic; where it says Polemic, read Cursive.
- The interface follows the Polemic UI kit: the tokens in `src/index.css` (mauve grays, indigo as the one tint), 28px rows, sentence case.
- Every block reads from and writes to Markdown. A new block needs its Markdown form and a round-trip case in `src/editor/markdown.test.ts`.
- Every change, feature or bug fix adds its line to the `## X.Y.Z (unreleased)` section at the top of [CHANGELOG.md](CHANGELOG.md), in the same pull request. Changes the reader doesn't see (CI, refactors, tests) get no line.
- Before you push: `pnpm lint`, `pnpm test` and `pnpm build`, and `cargo test` in `src-tauri` when you changed the desktop app.
