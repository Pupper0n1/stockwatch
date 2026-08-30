import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import type { WatchConfig } from '../src/config/schema.js';
import { processWatch, type EngineDeps } from '../src/core/engine.js';
import { StateStore } from '../src/core/state.js';
import type { CheckResult, Notification } from '../src/core/types.js';

const watch: WatchConfig = {
  name: 'gpu',
  url: 'https://x.test/gpu',
  check: { type: 'shopify' },
  notifyOn: ['restock', 'error'],
  enabled: true,
};

interface Harness {
  deps: EngineDeps;
  sent: Notification[];
  queue: CheckResult[];
}

async function harness(): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), 'stockwatch-'));
  const state = new StateStore(join(dir, 'state.json'));
  const sent: Notification[] = [];
  const queue: CheckResult[] = [];
  const deps: EngineDeps = {
    state,
    log: pino({ level: 'silent' }),
    errorThreshold: 2,
    historyLimit: 3,
    notify: async (_w, msg) => {
      sent.push(msg);
    },
    check: async () => {
      const next = queue.shift();
      if (!next) throw new Error('queue empty');
      return next;
    },
  };
  return { deps, sent, queue };
}

describe('processWatch', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });

  it('records a baseline silently, then notifies on out→in', async () => {
    h.queue.push({ status: 'out_of_stock' }, { status: 'out_of_stock' }, { status: 'in_stock', price: '499.00' });
    expect((await processWatch(watch, h.deps)).transition).toBe('baseline');
    expect((await processWatch(watch, h.deps)).transition).toBe('no_change');
    const third = await processWatch(watch, h.deps);
    expect(third.transition).toBe('restock');
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].title).toContain('Back in stock');
    expect(h.sent[0].body).toContain('499.00');
    expect(third.state.history.map((e) => e.status)).toEqual(['out_of_stock', 'in_stock']);
  });

  it('does not notify on first observation even if in stock', async () => {
    h.queue.push({ status: 'in_stock' });
    await processWatch(watch, h.deps);
    expect(h.sent).toHaveLength(0);
  });

  it('respects notifyOn for sold_out', async () => {
    h.queue.push({ status: 'in_stock' }, { status: 'out_of_stock' });
    await processWatch(watch, h.deps);
    const r = await processWatch(watch, h.deps);
    expect(r.transition).toBe('sold_out');
    expect(h.sent).toHaveLength(0); // 'sold_out' not in notifyOn
  });

  it('keeps last known status through errors and alerts once at threshold', async () => {
    h.queue.push({ status: 'out_of_stock' }, { status: 'unknown', detail: 'boom' }, { status: 'unknown', detail: 'boom' }, { status: 'unknown', detail: 'boom' });
    await processWatch(watch, h.deps);
    expect((await processWatch(watch, h.deps)).transition).toBe('error');
    const hit = await processWatch(watch, h.deps);
    expect(hit.transition).toBe('error_threshold');
    expect(hit.state.status).toBe('out_of_stock');
    expect(hit.state.consecutiveErrors).toBe(2);
    expect((await processWatch(watch, h.deps)).transition).toBe('error'); // no second alert
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].title).toMatch(/failed checks/);
  });

  it('a thrown checker counts as an error result', async () => {
    const r = await processWatch(watch, h.deps); // queue empty ⇒ throws
    expect(r.result.status).toBe('unknown');
    expect(r.result.detail).toBe('queue empty');
  });

  it('caps history at historyLimit and persists to disk', async () => {
    h.queue.push({ status: 'in_stock' }, { status: 'out_of_stock' }, { status: 'in_stock' }, { status: 'out_of_stock' }, { status: 'in_stock' });
    for (let i = 0; i < 5; i++) await processWatch(watch, h.deps);
    expect(h.deps.state.get('gpu').history).toHaveLength(3);

    const reloaded = new StateStore((h.deps.state as unknown as { path: string }).path);
    await reloaded.load();
    expect(reloaded.get('gpu').status).toBe('in_stock');
  });
});
