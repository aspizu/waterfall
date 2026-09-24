import {DatabaseSync} from "node:sqlite"
import {basename} from "node:path"
import {mergeIntervals, subtractIntervals, type Interval} from "../src/lib/metrics.ts"

type SessionRow = {
  id: string
  title: string
  directory: string
  parent_id: string | null
  time_created: number
  time_updated: number
  time_archived: number | null
  project_name: string | null
  project_worktree: string | null
}
type TimedRow = {session_id: string; time_created: number; time_updated: number; data: string}
type MessageData = {role?: string; time?: {created?: number; completed?: number}}
type PartData = {
  type?: string
  tool?: string
  time?: {start?: number; end?: number}
  state?: {time?: {start?: number; end?: number}}
}

const internalTitles = new Set(["T3 Code generateThreadTitle", "T3 Code generateBranchName"])
const valid = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

function addInterval(target: Interval[], start: unknown, end: unknown) {
  if (valid(start) && valid(end) && end > start) target.push([start, end])
}

export function parseOpenCodeDatabase(path: string) {
  const db = new DatabaseSync(path, {readOnly: true})
  try {
    const sessions = db
      .prepare(
        "SELECT s.id, s.title, s.directory, s.parent_id, s.time_created, s.time_updated, s.time_archived, p.name AS project_name, p.worktree AS project_worktree FROM session s LEFT JOIN project p ON p.id = s.project_id",
      )
      .all() as SessionRow[]
    const messages = db
      .prepare("SELECT session_id, time_created, time_updated, data FROM message")
      .iterate() as IterableIterator<TimedRow>
    const parts = db
      .prepare("SELECT session_id, time_created, time_updated, data FROM part")
      .iterate() as IterableIterator<TimedRow>
    const bySession = new Map<
      string,
      {messages: number[]; turns: Interval[]; activity: Interval[]; waits: Interval[]; last: number}
    >()
    for (const session of sessions)
      if (!session.parent_id && !internalTitles.has(session.title))
        bySession.set(session.id, {
          messages: [],
          turns: [],
          activity: [],
          waits: [],
          last: session.time_created,
        })

    for (const row of messages) {
      const chat = bySession.get(row.session_id)
      if (!chat) continue
      let data: MessageData
      try {
        data = JSON.parse(row.data)
      } catch {
        continue
      }
      const start = valid(data.time?.created) ? data.time.created : row.time_created
      if (data.role === "user") chat.messages.push(start)
      if (data.role === "assistant") {
        const end = valid(data.time?.completed) ? data.time.completed : row.time_updated
        addInterval(chat.turns, start, end)
        addInterval(chat.activity, start, end)
      }
      chat.last = Math.max(chat.last, row.time_updated, start)
    }

    for (const row of parts) {
      const chat = bySession.get(row.session_id)
      if (!chat) continue
      let data: PartData
      try {
        data = JSON.parse(row.data)
      } catch {
        continue
      }
      if (data.type === "tool") {
        const start = data.state?.time?.start ?? row.time_created
        const end = data.state?.time?.end ?? row.time_updated
        addInterval(
          /(?:^|[._])(?:sleep|question|wait)$/.test(data.tool ?? "") ? chat.waits : chat.activity,
          start,
          end,
        )
      } else if (data.type === "reasoning" || data.type === "text") {
        addInterval(
          chat.activity,
          data.time?.start ?? row.time_created,
          data.time?.end ?? row.time_updated,
        )
      }
      chat.last = Math.max(chat.last, row.time_updated)
    }

    return sessions.flatMap((session) => {
      const data = bySession.get(session.id)
      if (!data || !valid(session.time_created)) return []
      const turns = mergeIntervals(data.turns)
      const waits = mergeIntervals(data.waits)
      const activity = subtractIntervals(data.activity, waits)
      const project =
        session.project_name ||
        (session.project_worktree && session.project_worktree !== "/"
          ? basename(session.project_worktree)
          : basename(session.directory))
      return [
        {
          id: `opencode:${session.id}`,
          title: session.title || `Chat ${session.id.slice(-8)}`,
          project,
          worktree:
            session.directory === session.project_worktree ? "main" : basename(session.directory),
          kind: "chat",
          archived: valid(session.time_archived),
          archivedAt: session.time_archived,
          createdAt: session.time_created,
          lastAt: Math.max(data.last, session.time_updated || session.time_created),
          turns,
          waits,
          activity,
          unknown: subtractIntervals(turns, [...waits, ...activity]),
          messages: [...new Set(data.messages)].sort((a, b) => a - b),
          incompleteTurns: 0,
          malformed: 0,
        },
      ]
    })
  } finally {
    db.close()
  }
}
