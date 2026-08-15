import { describe, expect, it } from 'vitest';
import { formatDuration, parseDuration, relativeTime } from '../src/config/duration.js';

describe('duration', () => {
  it('parses units', () => {
    expect(parseDuration('250ms')).toBe(250);
    expect(parseDuration('30s')).toBe(30_000);
    expect(parseDuration('5m')).toBe(300_000);
    expect(parseDuration('2h')).toBe(7_200_000);
  });
  it('rejects garbage', () => {
    expect(() => parseDuration('5 minutes')).toThrow(/Invalid duration/);
    expect(() => parseDuration('')).toThrow();
  });
  it('formats and describes relative time', () => {
    expect(formatDuration(90_000)).toBe('2m');
    expect(formatDuration(5_400_000)).toBe('1.5h');
    const now = new Date('2026-01-01T00:10:00Z');
    expect(relativeTime('2026-01-01T00:07:00Z', now)).toBe('3m ago');
    expect(relativeTime(null, now)).toBe('never');
  });
});
