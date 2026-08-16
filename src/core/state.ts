import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StockStatus } from './types.js';

export interface HistoryEntry {
  at: string;
  status: StockStatus;
  detail?: string;
  price?: string;
}

export interface WatchState {
  /** Last *known* status. Failed checks do not reset this. */
  status: StockStatus;
  lastChecked: string | null;
  lastChanged: string | null;
  lastDetail?: string;
  lastPrice?: string;
  consecutiveErrors: number;
  errorNotified: boolean;
  history: HistoryEntry[];
}

export interface StateFile {
  version: 1;
  watches: Record<string, WatchState>;
}

export function emptyWatchState(): WatchState {
  return {
    status: 'unknown',
    lastChecked: null,
    lastChanged: null,
    consecutiveErrors: 0,
    errorNotified: false,
    history: [],
  };
}

export class StateStore {
  private data: StateFile = { version: 1, watches: {} };
  /** Saves are chained so concurrent watches never race on the temp file. */
  private pendingSave: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as Partial<StateFile>;
      if (raw.version === 1 && raw.watches) this.data = { version: 1, watches: raw.watches };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  get(name: string): WatchState {
    return this.data.watches[name] ?? emptyWatchState();
  }

  set(name: string, state: WatchState): void {
    this.data.watches[name] = state;
  }

  names(): string[] {
    return Object.keys(this.data.watches);
  }

  /** Atomic write (temp file + rename), serialized across callers. */
  save(): Promise<void> {
    const run = this.pendingSave.then(() => this.writeNow());
    this.pendingSave = run.catch(() => undefined);
    return run;
  }

  private async writeNow(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2));
    await rename(tmp, this.path);
  }
}
