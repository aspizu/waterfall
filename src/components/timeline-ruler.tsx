export function TimelineRuler({ticks}: {ticks: string[]}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-3 h-5 border-0 bg-transparent text-[11px] font-medium text-[#c0c4ce] [-webkit-text-stroke:1.5px_#08090d] [paint-order:stroke_fill]">
      <div className="flex h-full items-center justify-between px-2">
        {ticks.map((label, index) => (
          <span key={index} className="max-[600px]:even:hidden">
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
