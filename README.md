# waterfall

Static timeline for today in the browser's local time zone, built with pnpm, Vite, and React. Chat rows share the screen height equally, with titles over the strips. Every chat has a continuous strip sharing an axis from the earliest chat start today to the current time. A small floating chevron opens an Incognito Mode switch that replaces titles with numbered labels. Earlier days are hidden.

```sh
pnpm install
pnpm dev
pnpm build
```

Both dev and build generate `public/data/activity.json` from `~/.codex/sessions` and `~/.codex/archived_sessions`. The browser only reads that static snapshot. There is no backend. `pnpm data` regenerates the snapshot; reload the browser afterward. `CODEX_DATA_DIR=/path/to/codex pnpm build` uses another source directory. `pnpm preview` serves the production build in `dist/`.

Chat titles come from the session index, with a read-only local metadata database as a fallback. The database also supplies archive times when available. Labels show `project / worktree · chat title`; the main Git checkout is named `main`. Project and worktree names come from saved project metadata and the checkout, with transcript paths as a fallback for removed worktrees. Incognito Mode replaces the whole label with a chat number. The JSON omits message bodies, commands, and tool output. It contains chat titles, project and worktree names, and timestamps, so publishing the build also publishes those fields.

Activity is sampled into one-minute bins. Agent intensity is the fraction of each minute covered by recorded reasoning, response, or tool spans. Sent messages mark their minute at full intensity. Each minute maps directly to a fixed dark, purple, blue, cyan, and green palette at 0%, 25%, 50%, 75%, and 100% activity, with linear blending between colors. The strip is near-black before the chat starts. Archived chats fade from their last sent message to black at the archive time, then stay black. If an archive time is unavailable, the fade ends at the last recorded event. It is a visual density view, not a duration score.

Idle lifespan and unclassified gaps do not contribute to the gradient. Known explicit waits are subtracted when recognized. Tool spans may still contain internal waits and do not establish useful output. Subagents are excluded. Days use the browser's local time zone; chats spanning multiple days appear on each day with recorded activity, sent messages, or an archive event. Empty chats appear on their creation day. Deleted chats without a transcript or deletion timestamp cannot be marked.

`pnpm test` runs the parser and interval calculation tests.

`pnpm lint` checks code with Oxlint. `pnpm format` formats project files with Oxfmt, and `pnpm format:check` checks formatting. Lefthook checks staged files before commits and runs the TypeScript check before pushes.
