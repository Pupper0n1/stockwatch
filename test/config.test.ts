import { parse } from 'yaml';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ConfigError, interpolateEnv, parseConfig } from '../src/config/load.js';

const minimal = {
  notifiers: { phone: { type: 'ntfy', topic: 't' } },
  watches: [{ name: 'w', url: 'https://x.test/p', check: { type: 'shopify' } }],
};

describe('interpolateEnv', () => {
  it('substitutes ${VAR} and ${VAR:-default} recursively', () => {
    const env = { TOPIC: 'abc' };
    expect(interpolateEnv({ a: ['${TOPIC}', '${MISSING:-fallback}'], b: { c: 'x-${TOPIC}' } }, env)).toEqual({
      a: ['abc', 'fallback'],
      b: { c: 'x-abc' },
    });
  });
  it('throws on missing var without default', () => {
    expect(() => interpolateEnv('${NOPE}', {})).toThrow(ConfigError);
  });
});

describe('parseConfig', () => {
  it('applies defaults', () => {
    const cfg = parseConfig(minimal);
    expect(cfg.defaults.interval).toBe('5m');
    expect(cfg.defaults.errorThreshold).toBe(3);
    expect(cfg.stateFile).toBe('./data/state.json');
    expect(cfg.watches[0].notifyOn).toEqual(['restock']);
    expect(cfg.watches[0].enabled).toBe(true);
  });
  it('rejects unknown notifier references and duplicate names', () => {
    expect(() => parseConfig({ ...minimal, watches: [{ ...minimal.watches[0], notify: ['nope'] }] })).toThrow(
      /unknown notifier "nope"/,
    );
    expect(() => parseConfig({ ...minimal, watches: [minimal.watches[0], minimal.watches[0]] })).toThrow(/Duplicate/);
  });
  it('rejects unknown keys and bad durations with readable messages', () => {
    expect(() => parseConfig({ ...minimal, watches: [{ ...minimal.watches[0], intervall: '5m' }] })).toThrow(
      /Invalid config/,
    );
    expect(() => parseConfig({ ...minimal, defaults: { interval: '5 min' } })).toThrow(/duration like/);
  });
  it('the shipped example config is valid', async () => {
    const raw = parse(await readFile(new URL('../stockwatch.example.yaml', import.meta.url), 'utf8'));
    const cfg = parseConfig(raw, { NTFY_TOPIC: 'demo' });
    expect(cfg.watches.length).toBeGreaterThan(3);
    expect(cfg.notifiers.phone).toMatchObject({ type: 'ntfy', topic: 'demo', server: 'https://ntfy.sh' });
  });
});
