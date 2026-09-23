import type {TimelineDay} from "../lib/timeline.ts"

type ChatRowProps = {
  chat: TimelineDay["chats"][number]
  index: number
  ticks: string[]
  incognitoMode: boolean
}

export function ChatRow({chat, index, ticks, incognitoMode}: ChatRowProps) {
  const title = incognitoMode ? `Chat ${index + 1}` : chat.title
  const project = incognitoMode ? "" : chat.project
  const label = project ? `${title} · ${project}` : title

  return (
    <div className="grid min-h-0 grid-cols-1 overflow-hidden border-t border-[#151720] first:border-t-0">
      <div className="pointer-events-none relative z-1 col-start-1 row-start-1 m-0.5 min-w-0 self-end justify-self-stretch truncate text-xs/normal  font-medium text-[#e6edf3] [-webkit-text-stroke:1.5px_#08090d] [paint-order:stroke_fill] max-[600px]:text-[11px]">
        ({project}) {title}
      </div>
      <div
        className="col-start-1 row-start-1 min-h-0 min-w-0"
        style={{backgroundImage: chat.gradient}}
        role="img"
        aria-label={`${label}, activity from ${ticks[0]} to ${ticks.at(-1)}`}
      />
    </div>
  )
}
