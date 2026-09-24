import {useMemo, useState} from "react"
import {LoadingSpinner} from "./components/loading-spinner.tsx"
import {SettingsPanel} from "./components/settings-panel.tsx"
import {Timeline} from "./components/timeline.tsx"
import {useActivity} from "./hooks/use-activity.ts"
import {makeDays} from "./lib/timeline.ts"

export default function App() {
  const {data, error} = useActivity()
  const [incognitoMode, setIncognitoMode] = useState(false)
  const days = useMemo(() => makeDays(data?.chats || []), [data])

  if (error && !data)
    return (
      <p className="m-5 text-xs" role="alert">
        {error.message}
      </p>
    )
  if (!data) return <LoadingSpinner />
  if (!days.length) return <p className="m-5 text-xs">No recorded chats in this period.</p>

  return (
    <main
      className="w-full animate-in fade-in duration-300 motion-reduce:animate-none"
      aria-label="Daily chat activity. Brighter colors show recorded agent activity and sent messages. Dark areas are idle or unclassified."
    >
      {days.map((day) => (
        <Timeline key={day.start} day={day} incognitoMode={incognitoMode} />
      ))}
      <SettingsPanel incognitoMode={incognitoMode} onIncognitoChange={setIncognitoMode} />
    </main>
  )
}
