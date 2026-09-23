import {mergeIntervals, subtractIntervals, type Interval} from "../src/lib/metrics.ts"

type Payload = Record<string, any>
export type TranscriptRecord = {timestamp: string; type: string; payload: Payload}
type ParserOptions = {archived?: boolean; fallbackId?: string}

const millis = (value: unknown): number =>
  typeof value === "number"
    ? Math.abs(value) < 100_000_000_000
      ? value * 1000
      : value
    : Date.parse(String(value))
// Boundary fields in current Codex logs are whole Unix seconds. The enclosing
// event timestamp retains milliseconds and avoids rounding turn ends backwards.
const boundary = (value: unknown, eventTime: number) =>
  typeof value === "number" && Math.abs(value) < 100_000_000_000
    ? eventTime
    : Number.isFinite(millis(value))
      ? millis(value)
      : eventTime
const workTypes = new Set([
  "Reasoning",
  "AgentMessage",
  "CommandExecution",
  "FileChange",
  "McpToolCall",
  "Extension",
  "ImageView",
  "ContextCompaction",
  "WebSearch",
])
const isWaitName = (name: string) =>
  /(?:^|[._])(?:sleep|request_user_input|wait_agent|wait_threads|get_handoff_status)$/.test(
    name || "",
  )

function isWaitCall(name: string, input = "") {
  if (isWaitName(name)) return true
  if (name !== "exec") return false
  const calls = [...String(input).matchAll(/tools\.([a-zA-Z0-9_]+)/g)].map((m) =>
    m[1].replaceAll("__", "."),
  )
  return calls.length > 0 && calls.every(isWaitName)
}

// Streaming reader: keep times and IDs, never retain prompt/tool output bodies.
export function createTranscriptParser({
  archived = false,
  fallbackId = "unknown",
}: ParserOptions = {}) {
  let meta: Payload = {},
    first = Infinity,
    last = -Infinity,
    malformed = 0
  const starts = new Map<string, number>(),
    turns: Interval[] = [],
    activity: Interval[] = [],
    waits: Interval[] = [],
    calls = new Map<string, {start: number; wait: boolean; ignore: boolean}>()
  const nativeMessages = new Map<string | number, number>(),
    legacyMessages = new Map<string | number, number>(),
    fallbackMessages = new Map<string | number, number>()
  const seen = new Set<string>()
  const push = (target: Interval[], start: number, end: number) => {
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) target.push([start, end])
  }

  function ingest(record: TranscriptRecord) {
    const p = record.payload || {},
      t = millis(record.timestamp)
    if (record.type === "session_meta") {
      meta = p
      return
    }
    if (!Number.isFinite(t)) return
    // Forks can contain copied history from before the new chat existed.
    if (Number.isFinite(millis(meta.timestamp)) && t < millis(meta.timestamp)) return
    first = Math.min(first, t)
    last = Math.max(last, t)
    const id = p.turn_id || "legacy-turn"
    if (record.type === "event_msg") {
      if (p.type === "task_started") {
        if (!starts.has(id)) starts.set(id, boundary(p.started_at, t))
      }
      if (p.type === "task_complete" || p.type === "turn_aborted") {
        const end = boundary(p.completed_at, t)
        const start =
          starts.get(id) ??
          (Number.isFinite(p.duration_ms) ? end - p.duration_ms : millis(p.started_at))
        push(turns, start, end)
        starts.delete(id)
      }
      if (p.type === "user_message") legacyMessages.set(p.id || t, t)
      if (p.type === "item_completed" && p.item) {
        if (p.thread_id && meta.id && p.thread_id !== meta.id) return
        const item = p.item
        const key = item.id || `${item.type}:${p.started_at_ms}:${p.completed_at_ms}`
        if (seen.has(key)) return
        seen.add(key)
        if (item.type === "UserMessage")
          nativeMessages.set(item.client_id || key, p.started_at_ms ?? t)
        else if (workTypes.has(item.type)) {
          const waiting = isWaitCall(
            item.tool || item.name,
            typeof item.arguments === "string" ? item.arguments : "",
          )
          push(waiting ? waits : activity, p.started_at_ms, p.completed_at_ms)
        }
      }
    }
    if (record.type === "response_item") {
      if (p.type === "function_call" || p.type === "custom_tool_call") {
        calls.set(p.call_id, {
          start: t,
          wait: isWaitCall(p.name, p.input || p.arguments),
          ignore: p.name === "untrusted_input",
        })
      }
      if (p.type === "function_call_output" || p.type === "custom_tool_call_output") {
        const call = calls.get(p.call_id)
        if (call && !call.ignore) push(call.wait ? waits : activity, call.start, t)
        calls.delete(p.call_id)
      }
      if (p.type === "message" && p.role === "user") {
        const text = (p.content || [])
          .map((c: Payload) => c.text || "")
          .join("\n")
          .trim()
        const contextOnly =
          text.startsWith("<environment_context>") ||
          text.startsWith("# AGENTS.md instructions") ||
          text.startsWith("<recommended_plugins>") ||
          text.startsWith("<turn_aborted>")
        if (text && !contextOnly) fallbackMessages.set(p.id || t, t)
      }
    }
  }

  function finish() {
    const incompleteTurns = starts.size
    // A missing completion never extends to wall-clock now.
    for (const start of starts.values()) push(turns, start, last)
    const allTurns = mergeIntervals(turns)
    const knownWaits = mergeIntervals(waits)
    const work = subtractIntervals(activity, knownWaits)
    const unknown = subtractIntervals(allTurns, [...work, ...knownWaits])
    const messages = [
      ...(nativeMessages.size
        ? nativeMessages
        : legacyMessages.size
          ? legacyMessages
          : fallbackMessages
      ).values(),
    ]
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
    const source = typeof meta.source === "string" ? meta.source : JSON.stringify(meta.source || "")
    const kind =
      /subagent/i.test(source) || /subagent|agent/i.test(meta.thread_source || "")
        ? "subagent"
        : "chat"
    const createdAt = millis(meta.timestamp)
    return {
      id: meta.id || meta.session_id || fallbackId,
      title: "Untitled chat",
      cwd: typeof meta.cwd === "string" ? meta.cwd : null,
      repository: typeof meta.git?.repository_url === "string" ? meta.git.repository_url : null,
      kind,
      archived,
      createdAt: Number.isFinite(createdAt) ? createdAt : Number.isFinite(first) ? first : null,
      lastAt: Number.isFinite(last) ? last : Number.isFinite(createdAt) ? createdAt : null,
      turns: allTurns,
      activity: work,
      waits: knownWaits,
      unknown,
      messages: [...new Set(messages)],
      incompleteTurns,
      malformed,
    }
  }
  return {
    ingest,
    finish,
    malformedLine() {
      malformed++
    },
  }
}

export function parseRecords(records: TranscriptRecord[], options?: ParserOptions) {
  const parser = createTranscriptParser(options)
  records.forEach(parser.ingest)
  return parser.finish()
}
