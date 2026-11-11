/** Small pure helpers shared by the dashboard components. */

export function agoLabel(updatedAt: number, now: number): string {
  if (!updatedAt) return 'Not loaded yet'
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000))
  if (seconds < 5) return 'Updated just now'
  if (seconds < 60) return `Updated ${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `Updated ${minutes} min ago`
  return `Updated ${Math.round(minutes / 60)} h ago`
}

/** A count's share of a total, 0 when the total is 0 (never divides by zero). */
export function share(count: number, total: number): number {
  return total > 0 ? count / total : 0
}

/**
 * Talk time arrives in minutes. Under two hours it reads best as minutes
 * ("62 min"); past that, as whole hours ("3,090 h"), with the exact minutes
 * shown beside it by the caller.
 */
export function formatTalkTime(minutes: number): string {
  return minutes < 120
    ? `${Math.round(minutes).toLocaleString()} min`
    : `${Math.round(minutes / 60).toLocaleString()} h`
}

/** Basis points as a percentage: 7500 → "75%", 125 → "1.25%". */
export function bpsLabel(bps: number): string {
  return `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`
}
