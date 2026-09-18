const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["week", 1000 * 60 * 60 * 24 * 7],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
];

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 hours ago", "2 days ago", etc. Falls back to "just now" for anything under a minute. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = then - now.getTime();

  for (const [unit, ms] of UNITS) {
    if (Math.abs(diffMs) >= ms) {
      return formatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return "just now";
}
