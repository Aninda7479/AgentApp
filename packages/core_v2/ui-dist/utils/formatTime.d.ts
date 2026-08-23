/** Format an ISO timestamp as relative time ("just now", "2m ago", "1h ago"). */
export declare function formatRelativeTime(iso: string): string;
/** Format a duration between two ISO timestamps as human-readable ("12s", "2m 30s"). */
export declare function formatDuration(startIso: string, endIso?: string): string;
/** Parse a duration string like "12s" or "2m 30s" to milliseconds. */
export declare function parseDuration(duration: string): number;
//# sourceMappingURL=formatTime.d.ts.map