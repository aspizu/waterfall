import type {TimelineDay} from "../lib/timeline.ts"
import {ChatRow} from "./chat-row.tsx"
import {TimelineRuler} from "./timeline-ruler.tsx"

export function Timeline({day, incognitoMode}: {day: TimelineDay; incognitoMode: boolean}) {
  return (
    <section
      className="relative flex h-svh flex-col"
      aria-label={new Date(day.start).toLocaleDateString()}
    >
      <TimelineRuler ticks={day.ticks} />
      <div className="grid min-h-0 flex-1 auto-rows-fr">
        {day.chats.map((chat, index) => (
          <ChatRow
            key={chat.id}
            chat={chat}
            index={index}
            ticks={day.ticks}
            incognitoMode={incognitoMode}
          />
        ))}
      </div>
    </section>
  )
}
