import type { WatchConfig } from '../config/schema.js';
import type { CheckResult, Notification } from './types.js';

export type NotificationKind = 'restock' | 'sold_out' | 'error';

export function buildNotification(
  kind: NotificationKind,
  watch: WatchConfig,
  result: CheckResult,
  consecutiveErrors = 0,
): Notification {
  const price = result.price ? ` — ${result.price}` : '';
  switch (kind) {
    case 'restock':
      return {
        title: `🟢 Back in stock: ${watch.name}`,
        body: `${result.detail ?? 'Now available'}${price}`,
        url: watch.url,
        priority: 'high',
      };
    case 'sold_out':
      return {
        title: `🔴 Sold out: ${watch.name}`,
        body: `${result.detail ?? 'No longer available'}${price}`,
        url: watch.url,
        priority: 'default',
      };
    case 'error':
      return {
        title: `⚠️ ${watch.name}: ${consecutiveErrors} failed checks`,
        body: result.detail ?? 'Check keeps failing — selector may be stale or site is blocking.',
        url: watch.url,
        priority: 'low',
      };
  }
}
