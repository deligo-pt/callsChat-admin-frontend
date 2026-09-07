/**
 * Human-readable process uptime.
 *
 * Seconds are noise once a service has been up for hours, and days are what an
 * operator actually reads this for — "has it restarted recently?" — so the
 * unit scales and the smallest part is dropped rather than padded out.
 *
 * Its own module because a file exporting both a component and a plain
 * function breaks Fast Refresh.
 */
export function formatUptime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  if (seconds < 60) return `${seconds}s`

  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
