# waterfall

Static timeline for the current 9:00 AM to 9:00 AM period in the browser's local time zone, built with pnpm, Vite, and React. Chat rows share the screen height equally, with titles over the strips. Every chat has a continuous strip on a fixed 24 hour axis. Before 9:00 AM, the view shows the period that began the previous morning. A small floating chevron opens an Incognito Mode switch that replaces titles with numbered labels. Earlier periods are hidden.

```sh
pnpm install
pnpm dev
pnpm build
```

Both dev and build generate `public/data/activity.json` from Codex sessions in `~/.codex` and OpenCode sessions in `~/.local/share/opencode/opencode.db`. The browser only reads that static snapshot. There is no backend. `pnpm data` regenerates the snapshot; reload the browser afterward. `CODEX_DATA_DIR=/path/to/codex pnpm build` uses another Codex directory. `OPENCODE_DATA_DIR=/path/to/opencode pnpm build` uses another OpenCode data directory. The OpenCode location also follows `XDG_DATA_HOME` when set. `pnpm preview` serves the production build in `dist/`.

Codex chat titles come from the session index, with a read-only local metadata database as a fallback. OpenCode titles and archive times come from its read-only database. Labels show project and chat title. Project and worktree names come from saved project metadata and the checkout, with transcript paths as a fallback for removed worktrees. Incognito Mode replaces the label with a chat number. The JSON omits message bodies, commands, and tool output. It contains chat titles, project and worktree names, and timestamps, so publishing the build also publishes those fields.

Activity is sampled into one-minute bins. Agent intensity is the fraction of each minute covered by recorded reasoning, response, or tool spans. Sent messages mark their minute at full intensity. Each minute maps directly to a fixed dark, purple, blue, cyan, and green palette at 0%, 25%, 50%, 75%, and 100% activity, with linear blending between colors. The strip is near-black before the chat starts. Archived chats fade from their last sent message to black at the archive time, then stay black. If an archive time is unavailable, the fade ends at the last recorded event. It is a visual density view, not a duration score.

Idle lifespan and unclassified gaps do not contribute to the gradient. Known explicit waits are subtracted when recognized. Tool spans may still contain internal waits and do not establish useful output. Codex subagents, OpenCode child sessions, and T3 Code title and branch name helper sessions are excluded. The view uses the browser's local time zone; chats spanning multiple periods appear in each period with recorded activity, sent messages, or an archive event. Empty chats appear in their creation period. Deleted chats without a transcript or deletion timestamp cannot be marked.

`pnpm test` runs the parser and interval calculation tests.

`pnpm lint` checks code and Tailwind classes with Oxlint. Noncanonical classes such as `w-[260px]` are errors; `pnpm lint:fix` rewrites them to forms such as `w-65`. The Tailwind rules also flag unknown, conflicting, duplicate, and deprecated classes. `pnpm format` formats project files with Oxfmt, and `pnpm format:check` checks formatting. Lefthook checks staged formatting and runs lint before commits. Pushes run lint and the TypeScript check.
