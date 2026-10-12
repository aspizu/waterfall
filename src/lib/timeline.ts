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
const FADE = 30 * MINUTE

export const COLOR_SCHEMES = {
  magma: {
    label: "Magma",
    beforeStart: "rgb(12 8 10)",
    afterEnd: "rgb(0 0 0)",
    colors: [
      [22, 14, 20],
      [122, 28, 98],
      [200, 54, 73],
      [243, 129, 61],
      [252, 224, 144],
    ],
  },
  ocean: {
    label: "Ocean",
    beforeStart: "rgb(7 8 12)",
    afterEnd: "rgb(0 0 0)",
    colors: [
      [15, 20, 34],
      [87, 53, 138],
      [52, 105, 201],
      [27, 166, 190],
      [163, 220, 87],
    ],
  },
  aurora: {
    label: "Aurora",
    beforeStart: "rgb(6 10 10)",
    afterEnd: "rgb(0 0 0)",
    colors: [
      [9, 20, 22],
      [19, 78, 84],
      [34, 139, 117],
      [132, 205, 128],
      [235, 250, 190],
    ],
  },
}
export type ColorScheme = keyof typeof COLOR_SCHEMES

function palette(colors: number[][], activity: number) {
  const position = Math.max(0, Math.min(1, activity)) * (colors.length - 1)
  const lower = Math.min(colors.length - 2, Math.floor(position))
  const blend = position - lower
  const rgb = colors[lower].map((channel, index) =>
    Math.round(channel + (colors[lower + 1][index] - channel) * blend),
  )
  return `rgb(${rgb.join(" ")})`
}

const archiveTime = (chat: Chat) => chat.messages.at(-1) ?? chat.lastAt ?? null

function dayGradient(chat: Chat, start: number, end: number, scheme: ColorScheme) {
  const {colors, beforeStart, afterEnd} = COLOR_SCHEMES[scheme]
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
    return `${palette(colors, value)} ${((i / (bins - 1)) * 100).toFixed(3)}%`
  })
  const layers = []
  const percent = (time: number) =>
    Math.max(0, Math.min(100, ((time - start) / (end - start)) * 100)).toFixed(3)
  if (chat.createdAt > start)
    layers.push(
      `linear-gradient(to right, ${beforeStart} 0 ${percent(chat.createdAt)}%, transparent ${percent(chat.createdAt)}% 100%)`,
    )
  const archivedAt = archiveTime(chat)
  if (archivedAt !== null) {
    layers.push(
      `linear-gradient(to right, transparent ${percent(archivedAt)}%, ${afterEnd} ${percent(archivedAt + FADE)}%)`,
    )
  }
  layers.push(`linear-gradient(to right, ${stops.join(",")})`)
  return layers.join(", ")
}

export function makeDays(chats: Chat[], scheme: ColorScheme = "magma") {
  const now = Date.now()
  const date = new Date(now)
  date.setHours(9, 0, 0, 0)
  if (now < +date) date.setDate(date.getDate() - 1)
  let start = +date
  let end = start + 24 * 60 * MINUTE
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
  const chatStart = (chat: Chat) =>
    Math.min(chat.createdAt, ...chat.messages, ...chat.activity.map(([s]) => s))
  const chatEnd = (chat: Chat) =>
    Math.max(
      chat.lastAt ?? chat.createdAt,
      ...chat.messages,
      ...chat.activity.map(([, e]) => e),
      (archiveTime(chat) ?? 0) + FADE,
    )
  const starts = currentChats.map(chatStart).filter((time) => time >= start)
  if (starts.length) start = Math.min(...starts)
  end = Math.min(end, Math.max(...currentChats.map(chatEnd)))
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
      chats: day.chats.map((chat) => {
        const messages = chat.messages.filter((time) => time >= start && time < end).length
        const activeMinutes =
          chat.activity.reduce(
            (sum, [s, e]) => sum + Math.max(0, Math.min(e, end) - Math.max(s, start)),
            0,
          ) / MINUTE
        return {
          ...chat,
          startPercent:
            end > start
              ? Math.max(0, Math.min(100, ((chat.createdAt - start) / (end - start)) * 100))
              : 0,
          weight: Math.min(8, Math.max(1, Math.log2(1 + messages + activeMinutes))),
          gradient: dayGradient(chat, start, end, scheme),
        }
      }),
    },
  ]
}

export type TimelineDay = ReturnType<typeof makeDays>[number]
