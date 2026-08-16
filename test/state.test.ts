import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StateStore, emptyWatchState } from '../src/core/state.js';

describe('StateStore', () => {
  it('survives many concurrent saves and persists the final state', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'stockwatch-state-'));
    const store = new StateStore(join(dir, 'state.json'));
    await store.load(); // missing file is fine

    await Promise.all(
      Array.from({ length: 25 }, (_, i) => {
        store.set(`w${i}`, { ...emptyWatchState(), status: 'in_stock' });
        return store.save();
      }),
    );

    const onDisk = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')) as { watches: Record<string, unknown> };
    expect(Object.keys(onDisk.watches)).toHaveLength(25);

    const reloaded = new StateStore(join(dir, 'state.json'));
    await reloaded.load();
    expect(reloaded.names()).toHaveLength(25);
    expect(reloaded.get('w7').status).toBe('in_stock');
    expect(reloaded.get('missing').status).toBe('unknown');
  });
});
