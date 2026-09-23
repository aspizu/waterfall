import {useState} from "react"
import {ChevronDown, Settings} from "lucide-react"
import {cn} from "../lib/utils.ts"
import {Button} from "./ui/button.tsx"
import {Switch} from "./ui/switch.tsx"

type SettingsPanelProps = {
  incognitoMode: boolean
  onIncognitoChange: (checked: boolean) => void
}

export function SettingsPanel({incognitoMode, onIncognitoChange}: SettingsPanelProps) {
  const [open, setOpen] = useState(false)

  return (
    <aside
      className={cn(
        "fixed right-3 bottom-3 z-10 max-w-[calc(100vw-24px)] bg-[#0d111b]/76 text-[#e6edf3] shadow-[0_8px_24px_rgb(0_0_0/0.24)] backdrop-blur-lg",
        open ? "w-65 rounded-xl border border-white/14 p-2" : "w-7 rounded-[9px] border-0 p-0.5",
      )}
      aria-label="Settings"
    >
      <div className="flex items-center justify-end">
        {open && <span className="mr-auto pl-1.5 text-xs font-semibold">Settings</span>}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-6 border-0 text-[#e6edf3] hover:bg-white/8 hover:text-[#e6edf3] dark:hover:bg-white/8"
          aria-label={open ? "Collapse settings" : "Expand settings"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown aria-hidden="true" /> : <Settings aria-hidden="true" />}
        </Button>
      </div>
      {open && (
        <div className="flex items-center justify-between gap-4 px-1.5 pt-2.5 pb-1 text-xs">
          <label className="cursor-pointer" htmlFor="incognito-mode">
            Incognito Mode
          </label>
          <Switch
            id="incognito-mode"
            checked={incognitoMode}
            onCheckedChange={onIncognitoChange}
            className="data-[state=checked]:bg-[#43cbd4]! data-[state=unchecked]:bg-white/22!"
          />
        </div>
      )}
    </aside>
  )
}
