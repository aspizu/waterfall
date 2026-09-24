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
  const now = Date.now()
  const date = new Date(now)
  date.setHours(9, 0, 0, 0)
  if (now < +date) date.setDate(date.getDate() - 1)
  const start = +date
  const end = start + 24 * 60 * MINUTE
  const currentChats = chats.filter((chat) => {
    if (chat.kind === "subagent") return false
    const archivedAt = archiveTime(chat)
    return (
      chat.activity.some(([s, e]) => s < end && e > start) ||
      chat.messages.some((time) => time >= start && time < end) ||
      (archivedAt !== null && archivedAt >= start && archivedAt < end) ||
      (chat.createdAt >= start && chat.createdAt < end)
    )
  })
  if (!currentChats.length) return []
  const formatter = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
  const day: Day = {start, end, chats: currentChats}
  return [
    {
      ...day,
      ticks: Array.from({length: 5}, (_, i) => formatter.format(start + ((end - start) * i) / 4)),
      chats: day.chats.map((chat) => ({...chat, gradient: dayGradient(chat, start, end)})),
    },
  ]
}

export type TimelineDay = ReturnType<typeof makeDays>[number]
