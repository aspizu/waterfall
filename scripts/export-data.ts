import {createReadStream} from "node:fs"
import {execFile} from "node:child_process"
import {promisify} from "node:util"
import {readdir, mkdir, readFile, writeFile, rename} from "node:fs/promises"
import {createInterface} from "node:readline"
import {homedir} from "node:os"
import {join, dirname, basename, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {Result, ResultAsync, err, ok} from "neverthrow"
import {createTranscriptParser} from "./parse-transcript.ts"
import {mergeIntervals, subtractIntervals} from "../src/lib/metrics.ts"

const root = process.env.CODEX_DATA_DIR || join(homedir(), ".codex")
const project = fileURLToPath(new URL("../", import.meta.url))
const destination = join(project, "public/data/activity.json")
const toError = (cause: unknown) => (cause instanceof Error ? cause : new Error(String(cause)))
const parseJson = Result.fromThrowable(
  (line: string): Record<string, unknown> => JSON.parse(line),
  toError,
)
const runFile = promisify(execFile)
type Workspace = {cwd: string; project: string | null}
const workspaceCache = new Map<string, Promise<{project: string; worktree: string}>>()

function workspaceNames(cwd: string | null, repository: string | null, project: string | null) {
  if (!cwd)
    return Promise.resolve({project: project ?? "Unknown project", worktree: "Unknown worktree"})
  const key = JSON.stringify([cwd, repository, project])
  const cached = workspaceCache.get(key)
  if (cached) return cached
  const result = (async () => {
    const git = await ResultAsync.fromPromise(
      runFile("git", ["-C", cwd, "rev-parse", "--show-toplevel", "--git-common-dir"], {
        timeout: 3000,
      }),
      toError,
    )
    if (git.isOk()) {
      const [root, common] = git.value.stdout.trim().split("\n")
      const commonPath = resolve(cwd, common)
      const mainRoot = dirname(commonPath)
      const codexWorktree = root.match(/\/\.codex\/worktrees\/([^/]+)\//)?.[1]
      return {
        project: project ?? basename(mainRoot),
        worktree: root === mainRoot ? "main" : (codexWorktree ?? basename(root)),
      }
    }
    const t3 = cwd.match(/\/\.t3\/worktrees\/([^/]+)\/([^/]+)/)
    const codex = cwd.match(/\/\.codex\/worktrees\/([^/]+)\/([^/]+)/)
    const repositoryName = repository ? basename(repository).replace(/\.git$/, "") : null
    return {
      project: project ?? t3?.[1] ?? codex?.[2] ?? repositoryName ?? basename(cwd),
      worktree: t3?.[2] ?? codex?.[1] ?? basename(cwd),
    }
  })()
  workspaceCache.set(key, result)
  return result
}

async function findFiles(dir: string): Promise<Result<string[], Error>> {
  const listing = await ResultAsync.fromPromise(readdir(dir, {withFileTypes: true}), toError)
  if (listing.isErr())
    return (listing.error as NodeJS.ErrnoException).code === "ENOENT" ? ok([]) : err(listing.error)
  const children = await Promise.all(
    listing.value.map((entry) =>
      entry.isDirectory()
        ? findFiles(join(dir, entry.name))
        : Promise.resolve(
            ok(entry.isFile() && entry.name.endsWith(".jsonl") ? [join(dir, entry.name)] : []),
          ),
    ),
  )
  return Result.combine(children).map((groups) => groups.flat())
}

async function loadMetadata(): Promise<
  Result<
    {
      titles: Map<string, string>
      archivedAt: Map<string, number>
      workspaces: Map<string, Workspace>
    },
    Error
  >
> {
  const titles = new Map<string, string>()
  const archivedAt = new Map<string, number>()
  const workspaces = new Map<string, Workspace>()
  const metadata = {titles, archivedAt, workspaces}
  const index = await ResultAsync.fromPromise(
    readFile(join(root, "session_index.jsonl"), "utf8"),
    toError,
  )
  if (index.isErr() && (index.error as NodeJS.ErrnoException).code !== "ENOENT")
    return err(index.error)
  if (index.isOk()) {
    for (const line of index.value.split("\n")) {
      const item = parseJson(line)
      if (
        item.isOk() &&
        typeof item.value.id === "string" &&
        typeof item.value.thread_name === "string"
      )
        titles.set(item.value.id, item.value.thread_name)
    }
  }

  const listing = await ResultAsync.fromPromise(readdir(root), toError)
  if (listing.isErr()) {
    console.log("Using session index names; optional metadata database was unavailable.")
    return ok(metadata)
  }
  const databases = listing.value
    .filter((name) => /^state_\d+\.sqlite$/.test(name))
    .sort((a, b) => Number(b.match(/\d+/)![0]) - Number(a.match(/\d+/)![0]))
  if (!databases.length) return ok(metadata)

  const sqlite = await ResultAsync.fromPromise(import("node:sqlite"), toError)
  if (sqlite.isErr()) {
    console.log("Using session index names; optional metadata database was unavailable.")
    return ok(metadata)
  }
  const opened = Result.fromThrowable(
    () => new sqlite.value.DatabaseSync(join(root, databases[0]), {readOnly: true}),
    toError,
  )()
  if (opened.isErr()) {
    console.log("Using session index names; optional metadata database was unavailable.")
    return ok(metadata)
  }
  const database = opened.value
  const rows = Result.fromThrowable(
    () => database.prepare("SELECT id, title, name FROM threads").all(),
    toError,
  )()
  const archiveRows = Result.fromThrowable(
    () => database.prepare("SELECT id, archived, archived_at FROM threads").all(),
    toError,
  )()
  const workspaceRows = Result.fromThrowable(
    () =>
      database
        .prepare(
          "SELECT t.id, t.cwd, p.name AS project FROM threads t LEFT JOIN projects p ON p.id = t.project_id",
        )
        .all(),
    toError,
  )()
  const closed = Result.fromThrowable(() => database.close(), toError)()
  if (rows.isErr() || closed.isErr()) {
    console.log("Using session index names; optional metadata database was unavailable.")
    return ok(metadata)
  }
  for (const row of rows.value)
    if (typeof row.id === "string" && !titles.has(row.id) && (row.name || row.title))
      titles.set(row.id, String(row.name || row.title))
  if (archiveRows.isOk()) {
    for (const row of archiveRows.value)
      if (typeof row.id === "string" && row.archived === 1 && typeof row.archived_at === "number")
        archivedAt.set(
          row.id,
          row.archived_at < 100_000_000_000 ? row.archived_at * 1000 : row.archived_at,
        )
  }
  if (workspaceRows.isOk()) {
    for (const row of workspaceRows.value)
      if (typeof row.id === "string" && typeof row.cwd === "string")
        workspaces.set(row.id, {
          cwd: row.cwd,
          project: typeof row.project === "string" ? row.project : null,
        })
  }
  return ok(metadata)
}

async function exportData(): Promise<Result<void, Error>> {
  const metadataResult = await loadMetadata()
  if (metadataResult.isErr()) return err(metadataResult.error)
  const {titles, archivedAt, workspaces} = metadataResult.value
  const groups = await Promise.all(
    ["sessions", "archived_sessions"].map(async (folder) =>
      (await findFiles(join(root, folder))).map((paths) =>
        paths.map((path) => ({
          path,
          archived: folder === "archived_sessions",
        })),
      ),
    ),
  )
  const combined = Result.combine(groups)
  if (combined.isErr()) return err(combined.error)
  const files = combined.value.flat()
  type ExportChat = Omit<
    ReturnType<ReturnType<typeof createTranscriptParser>["finish"]>,
    "cwd" | "repository"
  > & {archivedAt: number | null; project: string; worktree: string}
  const chats = new Map<string, ExportChat>()
  for (const {path, archived} of files) {
    const parser = createTranscriptParser({archived, fallbackId: basename(path, ".jsonl")})
    const readResult = await ResultAsync.fromPromise(
      (async () => {
        const lines = createInterface({input: createReadStream(path), crlfDelay: Infinity})
        for await (const line of lines) {
          if (!line.trim()) continue
          const ingested = Result.fromThrowable(() => {
            const record = parseJson(line)
            if (record.isErr()) return false
            parser.ingest(record.value as Parameters<typeof parser.ingest>[0])
            return true
          }, toError)()
          if (ingested.isErr() || !ingested.value) parser.malformedLine()
        }
      })(),
      toError,
    )
    if (readResult.isErr()) return err(readResult.error)
    const {cwd, repository, ...parsed} = parser.finish()
    const workspace = workspaces.get(parsed.id)
    const names = await workspaceNames(
      workspace?.cwd ?? cwd,
      repository,
      workspace?.project ?? null,
    )
    const chat: ExportChat = {...parsed, ...names, archivedAt: archivedAt.get(parsed.id) ?? null}
    if (chat.createdAt === null) continue
    chat.title = titles.get(chat.id) || `Chat ${chat.id.slice(-8)}`
    const previous = chats.get(chat.id)
    if (previous) {
      chat.turns = mergeIntervals([...chat.turns, ...previous.turns])
      chat.waits = mergeIntervals([...chat.waits, ...previous.waits])
      chat.activity = subtractIntervals([...chat.activity, ...previous.activity], chat.waits)
      chat.unknown = subtractIntervals(chat.turns, [...chat.waits, ...chat.activity])
      chat.messages = [...new Set([...chat.messages, ...previous.messages])].sort((a, b) => a - b)
      chat.archived = chat.archived && previous.archived
      chat.archivedAt = chat.archivedAt ?? previous.archivedAt
      chat.createdAt = Math.min(chat.createdAt, previous.createdAt!)
      chat.lastAt = Math.max(chat.lastAt!, previous.lastAt!)
      chat.incompleteTurns = Math.max(chat.incompleteTurns, previous.incompleteTurns)
      chat.malformed += previous.malformed
    }
    chats.set(chat.id, chat)
  }

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceFiles: files.length,
    chats: [...chats.values()].sort((a, b) => a.createdAt! - b.createdAt!),
  }
  const saved = await ResultAsync.fromPromise(
    (async () => {
      await mkdir(dirname(destination), {recursive: true})
      await writeFile(`${destination}.tmp`, JSON.stringify(output))
      await rename(`${destination}.tmp`, destination)
    })(),
    toError,
  )
  if (saved.isErr()) return err(saved.error)
  console.log(
    `Exported ${output.chats.length} chats from ${files.length} transcript files. Snapshot: public/data/activity.json`,
  )
  if (!files.length)
    console.log("No transcripts found. Set CODEX_DATA_DIR to use another Codex directory.")
  return ok(undefined)
}

const result = await exportData()
result.match(
  () => undefined,
  (error) => {
    console.error(error)
    process.exitCode = 1
  },
)
