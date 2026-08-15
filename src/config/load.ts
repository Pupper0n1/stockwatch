import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { ZodError } from 'zod';
import { configSchema, type Config } from './schema.js';

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const ENV_PATTERN = /\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g;

/** Replace `${VAR}` / `${VAR:-default}` inside every string, recursively. */
export function interpolateEnv(value: unknown, env: NodeJS.ProcessEnv = process.env): unknown {
  if (typeof value === 'string') {
    return value.replace(ENV_PATTERN, (_whole, name: string, fallback: string | undefined) => {
      const resolved = env[name] ?? fallback;
      if (resolved === undefined) {
        throw new ConfigError(`Environment variable ${name} is referenced in config but not set`);
      }
      return resolved;
    });
  }
  if (Array.isArray(value)) return value.map((v) => interpolateEnv(v, env));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, interpolateEnv(v, env)]),
    );
  }
  return value;
}

function formatIssues(error: ZodError): string {
  return error.issues
    .map((issue) => `  • ${issue.path.length ? issue.path.join('.') : '<root>'}: ${issue.message}`)
    .join('\n');
}

export function parseConfig(raw: unknown, env: NodeJS.ProcessEnv = process.env): Config {
  const interpolated = interpolateEnv(raw, env);
  if (!interpolated || typeof interpolated !== 'object' || Array.isArray(interpolated)) {
    throw new ConfigError('Config must be a YAML mapping');
  }
  // zod 4's .default() short-circuits nested defaults, so seed the block explicitly.
  const seeded: Record<string, unknown> = { defaults: {}, ...(interpolated as Record<string, unknown>) };

  const parsed = configSchema.safeParse(seeded);
  if (!parsed.success) {
    throw new ConfigError(`Invalid config:\n${formatIssues(parsed.error)}`);
  }
  const config = parsed.data;

  const names = new Set<string>();
  for (const watch of config.watches) {
    if (names.has(watch.name)) throw new ConfigError(`Duplicate watch name "${watch.name}"`);
    names.add(watch.name);
    for (const notifier of watch.notify ?? []) {
      if (!(notifier in config.notifiers)) {
        throw new ConfigError(`Watch "${watch.name}" references unknown notifier "${notifier}"`);
      }
    }
  }
  return config;
}

export async function loadConfig(path: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    throw new ConfigError(`Cannot read config at ${path}: ${(err as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    throw new ConfigError(
      `Cannot parse YAML in ${path}: ${(err as Error).message}\n(Tip: quote values containing \${VAR} when using {} / [] flow syntax.)`,
    );
  }
  return parseConfig(raw);
}
