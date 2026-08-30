#!/usr/bin/env node
import { access, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { loadConfig, ConfigError } from './config/load.js';
import type { Config } from './config/schema.js';
import { relativeTime } from './config/duration.js';
import { processWatch, type EngineDeps } from './core/engine.js';
import { runScheduler } from './core/scheduler.js';
import { StateStore } from './core/state.js';
import { runChecker } from './checkers/index.js';
import { createDispatcher, sendNotification } from './notifiers/index.js';
import { createLogger } from './util/logger.js';
import { errorMessage } from './util/text.js';

try {
  process.loadEnvFile();
} catch {
  // no .env — fine
}

const DEFAULT_CONFIG = 'stockwatch.yaml';
const EXAMPLE_CONFIG = fileURLToPath(new URL('../stockwatch.example.yaml', import.meta.url));

const program = new Command()
  .name('stockwatch')
  .description('Self-hosted back-in-stock watcher')
  .option('-c, --config <path>', 'config file', DEFAULT_CONFIG)
  .option('-v, --verbose', 'debug logging');

interface GlobalOpts {
  config: string;
  verbose?: boolean;
}

function globals(): GlobalOpts {
  return program.opts<GlobalOpts>();
}

async function setup(): Promise<{ config: Config; state: StateStore; deps: EngineDeps }> {
  const opts = globals();
  const log = createLogger(opts.verbose ? 'debug' : undefined);
  const config = await loadConfig(opts.config);
  const state = new StateStore(config.stateFile);
  await state.load();
  const deps: EngineDeps = {
    state,
    log,
    errorThreshold: config.defaults.errorThreshold,
    historyLimit: config.defaults.historyLimit,
    userAgent: config.defaults.userAgent,
    notify: createDispatcher(config, log),
  };
  return { config, state, deps };
}

function fail(err: unknown): never {
  const msg = err instanceof ConfigError ? err.message : `Error: ${errorMessage(err)}`;
  console.error(msg);
  process.exit(1);
}

program
  .command('run')
  .description('Watch everything in the config until stopped')
  .option('--once', 'check each watch a single time, then exit')
  .action(async (cmd: { once?: boolean }) => {
    const { config, deps } = await setup().catch(fail);
    if (cmd.once) {
      const results = await Promise.all(config.watches.filter((w) => w.enabled).map((w) => processWatch(w, deps)));
      const failed = results.filter((r) => r.result.status === 'unknown').length;
      deps.log.info({ checked: results.length, failed }, 'single pass complete');
      process.exit(failed > 0 ? 2 : 0);
    }
    const controller = new AbortController();
    const stop = (signal: string) => {
      deps.log.info({ signal }, 'shutting down');
      controller.abort();
    };
    process.once('SIGINT', () => stop('SIGINT'));
    process.once('SIGTERM', () => stop('SIGTERM'));
    await runScheduler(config, { ...deps, signal: controller.signal });
  });

program
  .command('check <name>')
  .description('Run one watch immediately and print the raw result (no notifications, no state change)')
  .action(async (name: string) => {
    const { config, deps } = await setup().catch(fail);
    const watch = config.watches.find((w) => w.name === name);
    if (!watch) fail(new Error(`No watch named "${name}". Known: ${config.watches.map((w) => w.name).join(', ')}`));
    const started = Date.now();
    try {
      const result = await runChecker(watch.check, {
        watchName: watch.name,
        url: watch.url,
        userAgent: config.defaults.userAgent,
        log: deps.log,
      });
      console.log(JSON.stringify({ ...result, elapsedMs: Date.now() - started }, null, 2));
      if (result.status === 'unknown') {
        console.error('\nStatus is "unknown" — tighten the selector or add inStock/outOfStock rules.');
        process.exit(2);
      }
    } catch (err) {
      fail(err);
    }
  });

program
  .command('status')
  .description('Show last known state of every watch')
  .action(async () => {
    const { config, state } = await setup().catch(fail);
    const icon = { in_stock: '🟢', out_of_stock: '🔴', unknown: '⚪' } as const;
    const rows = config.watches.map((w) => {
      const s = state.get(w.name);
      return {
        '': icon[s.status],
        name: w.name,
        status: s.status,
        price: s.lastPrice ?? '',
        checked: relativeTime(s.lastChecked),
        changed: relativeTime(s.lastChanged),
        errors: s.consecutiveErrors,
        enabled: w.enabled ? '' : 'disabled',
      };
    });
    console.table(rows);
  });

program
  .command('test-notify [notifier]')
  .description('Send a test notification (to one notifier, or all)')
  .action(async (name?: string) => {
    const { config } = await setup().catch(fail);
    const targets = name ? [name] : Object.keys(config.notifiers);
    if (targets.length === 0) fail(new Error('No notifiers configured'));
    for (const target of targets) {
      const notifier = config.notifiers[target];
      if (!notifier) fail(new Error(`No notifier named "${target}". Known: ${Object.keys(config.notifiers).join(', ')}`));
      try {
        await sendNotification(notifier, {
          title: '🧪 stockwatch test',
          body: `Notifier "${target}" (${notifier.type}) is wired up.`,
          url: 'https://github.com',
          priority: 'default',
        });
        console.log(`✔ ${target} (${notifier.type})`);
      } catch (err) {
        console.error(`✖ ${target} (${notifier.type}): ${errorMessage(err)}`);
        process.exitCode = 1;
      }
    }
  });

program
  .command('validate')
  .description('Parse the config and report problems')
  .action(async () => {
    const opts = globals();
    const config = await loadConfig(opts.config).catch(fail);
    console.log(
      `✔ ${opts.config}: ${config.watches.length} watch(es), ${Object.keys(config.notifiers).length} notifier(s)`,
    );
  });

program
  .command('init')
  .description('Create a starter stockwatch.yaml in the current directory')
  .action(async () => {
    const target = globals().config;
    const exists = await access(target).then(
      () => true,
      () => false,
    );
    if (exists) fail(new Error(`${target} already exists`));
    await copyFile(EXAMPLE_CONFIG, target);
    console.log(`✔ wrote ${target} — edit it, then run: stockwatch check <name>`);
  });

program.parseAsync().catch(fail);
