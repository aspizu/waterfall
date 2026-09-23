export type Interval = [number, number];
export type IntervalChat = { turns: Interval[]; waits: Interval[]; activity: Interval[] };

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter(([s, e]) => Number.isFinite(s) && e > s)
    .map((i) => [...i])
    .sort((a, b) => a[0] - b[0]);
  const result: Interval[] = [];
  for (const [start, end] of sorted) {
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}

export function subtractIntervals(intervals: Interval[], exclusions: Interval[]): Interval[] {
  const cuts = mergeIntervals(exclusions);
  return mergeIntervals(intervals).flatMap(([start, end]) => {
    const parts: Interval[] = [];
    let cursor = start;
    for (const [s, e] of cuts) {
      if (e <= cursor) continue;
      if (s >= end) break;
      if (s > cursor) parts.push([cursor, Math.min(s, end)]);
      cursor = Math.max(cursor, e);
      if (cursor >= end) break;
    }
    if (cursor < end) parts.push([cursor, end]);
    return parts;
  });
}

export function clipIntervals(intervals: Interval[], from: number, to: number) {
  return mergeIntervals(intervals.map(([s, e]): Interval => [Math.max(s, from), Math.min(e, to)]));
}

export const intervalDuration = (intervals: Interval[]) =>
  intervals.reduce((sum, [s, e]) => sum + e - s, 0);

export function getIntervals(chat: IntervalChat, mode = "recorded") {
  return mode === "turns" ? subtractIntervals(chat.turns, chat.waits) : chat.activity;
}

export function concurrency(chats: IntervalChat[], from: number, to: number, mode = "recorded") {
  const events = new Map([
    [from, 0],
    [to, 0],
  ]);
  for (const chat of chats) {
    for (const [s, e] of clipIntervals(getIntervals(chat, mode), from, to)) {
      events.set(s, (events.get(s) || 0) + 1);
      events.set(e, (events.get(e) || 0) - 1);
    }
  }
  const ordered = [...events].sort((a, b) => a[0] - b[0]);
  const segments = [];
  let count = 0,
    activeMs = 0,
    parallelMs = 0,
    taskMs = 0,
    peak = 0,
    longest = 0,
    streak = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    const [start, delta] = ordered[i];
    const end = ordered[i + 1][0];
    count += delta;
    const duration = end - start;
    if (count > 0) activeMs += duration;
    if (count >= 2) {
      parallelMs += duration;
      streak += duration;
    } else streak = 0;
    taskMs += duration * count;
    peak = Math.max(peak, count);
    longest = Math.max(longest, streak);
    segments.push({ start, end, count });
  }
  return {
    segments,
    activeMs,
    parallelMs,
    taskMs,
    peak,
    longest,
    average: activeMs ? taskMs / activeMs : 0,
    parallelShare: activeMs ? parallelMs / activeMs : 0,
  };
}

export function formatDuration(ms: number) {
  if (ms < 1000) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}
