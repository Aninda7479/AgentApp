/** Format an ISO timestamp as relative time ("just now", "2m ago", "1h ago"). */
export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  
  if (seconds < 60) return 'just now';
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Format a duration between two ISO timestamps as human-readable ("12s", "2m 30s"). */
export function formatDuration(startIso: string, endIso?: string): string {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

/** Parse a duration string like "12s" or "2m 30s" to milliseconds. */
export function parseDuration(duration: string): number {
  let totalMs = 0;
  
  const minutesMatch = duration.match(/(\d+)\s*m/);
  if (minutesMatch) {
    totalMs += parseInt(minutesMatch[1], 10) * 60 * 1000;
  }
  
  const secondsMatch = duration.match(/(\d+)\s*s/);
  if (secondsMatch) {
    totalMs += parseInt(secondsMatch[1], 10) * 1000;
  }
  
  return totalMs;
}
