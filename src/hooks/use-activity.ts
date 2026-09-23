import {useQuery} from "@tanstack/react-query"
import type {Chat} from "../lib/timeline.ts"

export function useActivity() {
  return useQuery({
    queryKey: ["activity"],
    queryFn: async ({signal}): Promise<{chats: Chat[]}> => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/activity.json`, {signal})
      if (!response.ok) throw new Error("Activity snapshot unavailable. Run pnpm data.")
      return response.json()
    },
    staleTime: Infinity,
    retry: false,
    networkMode: "always",
  })
}
