import type { Logger } from '../util/logger.js';

export type StockStatus = 'in_stock' | 'out_of_stock' | 'unknown';

export interface CheckResult {
  status: StockStatus;
  /** Human-readable evidence: matched text, error, etc. */
  detail?: string;
  price?: string;
}

export interface CheckContext {
  watchName: string;
  url: string;
  userAgent?: string;
  log: Logger;
}

export interface Checker<C> {
  readonly type: string;
  check(config: C, ctx: CheckContext): Promise<CheckResult>;
}

export type NotificationPriority = 'low' | 'default' | 'high';

export interface Notification {
  title: string;
  body: string;
  url: string;
  priority: NotificationPriority;
}

export interface Notifier<C> {
  readonly type: string;
  send(config: C, message: Notification): Promise<void>;
}
