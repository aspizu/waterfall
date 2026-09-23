import {LoaderCircle} from "lucide-react"

export function LoadingSpinner() {
  return (
    <div className="flex h-svh items-center justify-center" role="status" aria-label="Loading">
      <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
    </div>
  )
}
