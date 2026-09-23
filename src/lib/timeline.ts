import type {Interval} from "./metrics.ts"

export type Chat = {
  id: string
  title: string
  project?: string
  worktree?: string
  kind: string
  archived: boolean
  archivedAt?: number | null
  createdAt: number
  lastAt: number | null
  activity: Interval[]
  messages: number[]
}
type Day = {start: number; end: number; chats: Chat[]}

const MINUTE = 60_000
const BEFORE_START = "rgb(7 8 12)"
const AFTER_ARCHIVE = "rgb(0 0 0)"
const PALETTE = [
  [15, 20, 34],
  [87, 53, 138],
  [52, 105, 201],
  [27, 166, 190],
  [163, 220, 87],
] as const

function palette(activity: number) {
  const position = Math.max(0, Math.min(1, activity)) * (PALETTE.length - 1)
  const lower = Math.min(PALETTE.length - 2, Math.floor(position))
  const blend = position - lower
  const rgb = PALETTE[lower].map((channel, index) =>
    Math.round(channel + (PALETTE[lower + 1][index] - channel) * blend),
  )
  return `rgb(${rgb.join(" ")})`
}

const archiveTime = (chat: Chat) => chat.archivedAt ?? (chat.archived ? chat.lastAt : null)

function dayGradient(chat: Chat, start: number, end: number) {
  const bins = Math.max(2, Math.ceil((end - start) / MINUTE))
  const binWidth = (end - start) / bins
  const values = new Float32Array(bins)
  for (const [s, e] of chat.activity) {
    if (e <= start || s >= end) continue
    const first = Math.max(0, Math.floor((s - start) / binWidth))
    const last = Math.min(bins - 1, Math.floor((e - start) / binWidth))
    for (let i = first; i <= last; i++) {
      const binStart = start + i * binWidth
      values[i] += Math.max(0, Math.min(e, binStart + binWidth) - Math.max(s, binStart)) / binWidth
    }
  }
  for (const t of chat.messages) {
    if (t >= start && t <= end) values[Math.min(bins - 1, Math.floor((t - start) / binWidth))] = 1
  }
  const stops = Array.from(values, (value, i) => {
    return `${palette(value)} ${((i / (bins - 1)) * 100).toFixed(3)}%`
  })
  const layers = []
  const percent = (time: number) =>
    Math.max(0, Math.min(100, ((time - start) / (end - start)) * 100)).toFixed(3)
  if (chat.createdAt > start)
    layers.push(
      `linear-gradient(to right, ${BEFORE_START} 0 ${percent(chat.createdAt)}%, transparent ${percent(chat.createdAt)}% 100%)`,
    )
  const archivedAt = archiveTime(chat)
  if (archivedAt !== null) {
    const lastMessage = Math.min(
      archivedAt,
      chat.messages.filter((time) => time <= archivedAt).at(-1) ?? chat.lastAt ?? chat.createdAt,
    )
    const fadePosition = (time: number) => (((time - start) / (end - start)) * 100).toFixed(3)
    layers.push(
      `linear-gradient(to right, transparent ${fadePosition(lastMessage)}%, ${AFTER_ARCHIVE} ${fadePosition(archivedAt)}%)`,
    )
  }
  layers.push(`linear-gradient(to right, ${stops.join(",")})`)
  return layers.join(", ")
}

export function makeDays(chats: Chat[]) {
  const days = new Map<number, Day>()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (const chat of chats) {
    if (chat.kind === "subagent") continue
    const cursor = new Date(chat.createdAt)
    cursor.setHours(0, 0, 0, 0)
    const archivedAt = archiveTime(chat)
    const last = Math.max(chat.lastAt ?? chat.createdAt, archivedAt ?? chat.createdAt)
    while (+cursor <= last) {
      const start = +cursor
      cursor.setDate(cursor.getDate() + 1)
      const end = +cursor
      const hasActivity = chat.activity.some(([s, e]) => s < end && e > start)
      const hasMessage = chat.messages.some((t) => t >= start && t < end)
      const hasArchive = archivedAt !== null && archivedAt >= start && archivedAt < end
      if (
        hasActivity ||
        hasMessage ||
        hasArchive ||
        (chat.createdAt >= start && chat.createdAt < end)
      ) {
        if (!days.has(start)) days.set(start, {start, end, chats: []})
        days.get(start)!.chats.push(chat)
      }
    }
  }
  return [...days.values()]
    .filter((day) => day.start === +today)
    .map((day) => {
      const from = Math.max(day.start, Math.min(...day.chats.map((chat) => chat.createdAt)))
      const last = Math.min(
        day.end,
        Math.max(
          ...day.chats.map((chat) =>
            Math.max(chat.lastAt ?? chat.createdAt, archiveTime(chat) ?? chat.createdAt),
          ),
        ),
      )
      const to = Math.min(day.end, Math.max(from + 1, last, Date.now()))
      const formatter = new Intl.DateTimeFormat([], {
        hour: "2-digit",
        minute: "2-digit",
        ...(to - from < 5 * MINUTE ? {second: "2-digit"} : {}),
        hour12: true,
      })
      return {
        ...day,
        ticks: Array.from({length: 5}, (_, i) => formatter.format(from + ((to - from) * i) / 4)),
        chats: day.chats.map((chat) => ({...chat, gradient: dayGradient(chat, from, to)})),
      }
    })
}

export type TimelineDay = ReturnType<typeof makeDays>[number]
