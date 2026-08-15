const UNIT_MS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };

export const DURATION_PATTERN = /^(\d+)(ms|s|m|h)$/;

/** Parse "30s" | "5m" | "1h" | "250ms" into milliseconds. */
export function parseDuration(input: string): number {
  const match = DURATION_PATTERN.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration "${input}" (expected e.g. 30s, 5m, 1h)`);
  }
  return Number(match[1]) * UNIT_MS[match[2]];
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1).replace(/\.0$/, '')}h`;
}

/** "3m ago", "just now", "2h ago" */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never';
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 5_000) return 'just now';
  return `${formatDuration(diff)} ago`;
}
