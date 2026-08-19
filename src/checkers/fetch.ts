import type { HttpOptions } from '../config/schema.js';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 15_000;

export class FetchError extends Error {
  override name = 'FetchError';
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(FetchError.describe(status, url));
  }

  private static describe(status: number, url: string): string {
    const base = `HTTP ${status} fetching ${url}`;
    if (status === 403 || status === 429 || status === 503) {
      return `${base} — likely bot protection or rate limiting. Try a longer interval or check type "playwright".`;
    }
    return base;
  }
}

function buildHeaders(http: HttpOptions | undefined, userAgent: string | undefined, accept: string): HeadersInit {
  return {
    'user-agent': http?.userAgent ?? userAgent ?? DEFAULT_USER_AGENT,
    accept,
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    ...(http?.headers ?? {}),
  };
}

async function doFetch(url: string, http: HttpOptions | undefined, userAgent: string | undefined, accept: string): Promise<Response> {
  const res = await fetch(url, {
    headers: buildHeaders(http, userAgent, accept),
    redirect: 'follow',
    signal: AbortSignal.timeout(http?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) throw new FetchError(res.status, url);
  return res;
}

export async function fetchText(url: string, http: HttpOptions | undefined, userAgent?: string): Promise<string> {
  const res = await doFetch(url, http, userAgent, 'text/html,application/xhtml+xml,*/*;q=0.8');
  return res.text();
}

export async function fetchJson(url: string, http: HttpOptions | undefined, userAgent?: string): Promise<unknown> {
  const res = await doFetch(url, http, userAgent, 'application/json,*/*;q=0.8');
  return res.json();
}
