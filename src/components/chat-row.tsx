import type {TimelineDay} from "../lib/timeline.ts"

const GERUNDS = [
  "Coagulating",
  "Calcifying",
  "Defenestrating",
  "Reticulating",
  "Percolating",
  "Fermenting",
  "Marinating",
  "Osmosing",
  "Sublimating",
  "Transmuting",
  "Distilling",
  "Crystallizing",
  "Gelatinizing",
  "Emulsifying",
  "Caramelizing",
  "Flocculating",
  "Effervescing",
  "Quiescing",
  "Recondensing",
  "Deliquescing",
  "Compiling",
  "Decanting",
  "Enumerating",
  "Extrapolating",
  "Fluxing",
  "Homogenizing",
  "Incubating",
  "Infusing",
  "Jiggling",
  "Liquefying",
  "Metabolizing",
  "Masticating",
  "Oxidizing",
  "Polymerizing",
  "Precipitating",
  "Putrefying",
  "Recalibrating",
  "Sequestering",
  "Simmering",
  "Spelunking",
  "Squinching",
  "Torqueing",
  "Transmogrifying",
  "Vitrifying",
  "Wrinkling",
]

function fakeTitle(seed: string, salt: number) {
  let hash = salt
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return `${GERUNDS[Math.abs(hash) % GERUNDS.length]}...`
}

export function fakeNames(seeds: string[]) {
  const used = new Set<string>()
  const names = new Map<string, string>()
  for (const seed of seeds) {
    if (names.has(seed)) continue
    let salt = 0
    let name = fakeTitle(seed, salt)
    while (used.has(name)) {
      salt++
      name = salt < GERUNDS.length ? fakeTitle(seed, salt) : `${fakeTitle(seed, 0)} ${salt}`
    }
    used.add(name)
    names.set(seed, name)
  }
  return names
}

type ChatRowProps = {
  chat: TimelineDay["chats"][number]
  index: number
  ticks: string[]
  incognitoMode: boolean
  fakeName?: string
}

export function ChatRow({chat, index, ticks, incognitoMode, fakeName}: ChatRowProps) {
  const title = incognitoMode ? (fakeName ?? `Chat ${index + 1}`) : chat.title
  const project = incognitoMode ? "" : chat.project
  const label = project ? `${title} · ${project}` : title

  return (
    <div className="grid min-h-0 grid-cols-1 overflow-hidden border-t border-[#151720] first:border-t-0">
      <div
        className="pointer-events-none relative z-1 col-start-1 row-start-1 m-0.5 min-w-0 self-end justify-self-stretch truncate text-xs/normal font-medium text-[#e6edf3] [-webkit-text-stroke:1.5px_#08090d] [paint-order:stroke_fill] max-[600px]:text-[11px]"
        style={{marginLeft: `calc(${chat.startPercent}% + 0.125rem)`}}
      >
        {project ? `(${project}) ` : ""}
        {title}
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
