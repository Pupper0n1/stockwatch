import { setTimeout as sleep } from 'node:timers/promises';
import type { Config, WatchConfig } from '../config/schema.js';
import { parseDuration, formatDuration } from '../config/duration.js';
import { processWatch, type EngineDeps } from './engine.js';

export interface SchedulerDeps extends EngineDeps {
  signal: AbortSignal;
}

const MAX_BACKOFF_MULTIPLIER = 4;
const MAX_STAGGER_MS = 5_000;

/** Run every enabled watch on its own interval until `signal` aborts. */
export async function runScheduler(config: Config, deps: SchedulerDeps): Promise<void> {
  const watches = config.watches.filter((w) => w.enabled);
  deps.log.info({ watches: watches.length }, 'scheduler started');
  await Promise.all(watches.map((watch) => loopWatch(watch, config, deps)));
  deps.log.info('scheduler stopped');
}

async function loopWatch(watch: WatchConfig, config: Config, deps: SchedulerDeps): Promise<void> {
  const baseMs = parseDuration(watch.interval ?? config.defaults.interval);
  const log = deps.log.child({ watch: watch.name });
  log.info({ interval: formatDuration(baseMs), check: watch.check.type }, 'watching');

  // Stagger start so all watches don't hammer the network at t=0.
  if (!(await wait(Math.random() * Math.min(baseMs, MAX_STAGGER_MS), deps.signal))) return;

  while (!deps.signal.aborted) {
    try {
      await processWatch(watch, deps);
    } catch (err) {
      log.error({ err }, 'unexpected engine failure');
    }
    const errors = deps.state.get(watch.name).consecutiveErrors;
    const backoff = Math.min(2 ** errors, MAX_BACKOFF_MULTIPLIER);
    const jitter = 1 + (Math.random() * 2 - 1) * config.defaults.jitter;
    if (!(await wait(baseMs * backoff * jitter, deps.signal))) return;
  }
}

/** Resolves true after `ms`, false if aborted first. */
async function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  try {
    await sleep(ms, undefined, { signal });
    return true;
  } catch {
    return false;
  }
}
