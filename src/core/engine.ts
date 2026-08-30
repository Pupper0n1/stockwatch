import type { WatchConfig } from '../config/schema.js';
import { runChecker } from '../checkers/index.js';
import type { Logger } from '../util/logger.js';
import { errorMessage } from '../util/text.js';
import { StateStore, type WatchState } from './state.js';
import { buildNotification } from './template.js';
import type { CheckContext, CheckResult, Notification } from './types.js';

export type Transition =
  | 'baseline' // first successful observation, nothing to compare against
  | 'restock' // out_of_stock → in_stock
  | 'sold_out' // in_stock → out_of_stock
  | 'no_change'
  | 'error' // check failed / returned unknown
  | 'error_threshold'; // failures hit the threshold (notification sent)

export interface EngineDeps {
  state: StateStore;
  log: Logger;
  errorThreshold: number;
  historyLimit: number;
  userAgent?: string;
  notify: (watch: WatchConfig, message: Notification) => Promise<void>;
  /** Injectable for tests. */
  check?: (config: WatchConfig['check'], ctx: CheckContext) => Promise<CheckResult>;
  now?: () => Date;
}

export interface ProcessOutcome {
  result: CheckResult;
  transition: Transition;
  state: WatchState;
}

export async function processWatch(watch: WatchConfig, deps: EngineDeps): Promise<ProcessOutcome> {
  const log = deps.log.child({ watch: watch.name });
  const now = (deps.now ?? (() => new Date()))().toISOString();
  const check = deps.check ?? runChecker;

  let result: CheckResult;
  try {
    result = await check(watch.check, { watchName: watch.name, url: watch.url, userAgent: deps.userAgent, log });
  } catch (err) {
    result = { status: 'unknown', detail: errorMessage(err) };
  }

  const prev = deps.state.get(watch.name);
  const next: WatchState = { ...prev, lastChecked: now, lastDetail: result.detail, history: [...prev.history] };
  if (result.price) next.lastPrice = result.price;

  let transition: Transition;

  if (result.status === 'unknown') {
    next.consecutiveErrors = prev.consecutiveErrors + 1;
    transition = 'error';
    log.warn({ detail: result.detail, consecutiveErrors: next.consecutiveErrors }, 'check failed');

    if (next.consecutiveErrors >= deps.errorThreshold && !next.errorNotified) {
      next.errorNotified = true;
      transition = 'error_threshold';
      if (watch.notifyOn.includes('error')) {
        await deps.notify(watch, buildNotification('error', watch, result, next.consecutiveErrors));
      }
    }
  } else {
    next.consecutiveErrors = 0;
    next.errorNotified = false;

    if (prev.status === 'unknown') {
      transition = 'baseline';
      next.status = result.status;
      next.lastChanged = now;
      pushHistory(next, { at: now, status: result.status, detail: result.detail, price: result.price }, deps.historyLimit);
      log.info({ status: result.status, detail: result.detail, price: result.price }, 'baseline recorded');
    } else if (prev.status !== result.status) {
      transition = result.status === 'in_stock' ? 'restock' : 'sold_out';
      next.status = result.status;
      next.lastChanged = now;
      pushHistory(next, { at: now, status: result.status, detail: result.detail, price: result.price }, deps.historyLimit);
      log.info({ from: prev.status, to: result.status, price: result.price }, transition === 'restock' ? '🟢 RESTOCK' : '🔴 sold out');

      if (watch.notifyOn.includes(transition)) {
        await deps.notify(watch, buildNotification(transition, watch, result));
      }
    } else {
      transition = 'no_change';
      log.debug({ status: result.status, detail: result.detail }, 'no change');
    }
  }

  deps.state.set(watch.name, next);
  await deps.state.save();
  return { result, transition, state: next };
}

function pushHistory(state: WatchState, entry: WatchState['history'][number], limit: number): void {
  state.history.push(entry);
  if (state.history.length > limit) state.history.splice(0, state.history.length - limit);
}
