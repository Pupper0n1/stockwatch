import type { JsonCheckConfig } from '../config/schema.js';
import type { Checker, CheckContext, CheckResult } from '../core/types.js';
import { fetchJson } from './fetch.js';
import { getPath } from './path.js';

export const jsonChecker: Checker<JsonCheckConfig> = {
  type: 'json',
  async check(config, ctx: CheckContext): Promise<CheckResult> {
    const data = await fetchJson(config.endpoint ?? ctx.url, config.http, ctx.userAgent);
    const value = getPath(data, config.path);
    const priceValue = config.pricePath ? getPath(data, config.pricePath) : undefined;
    const price = priceValue === undefined || priceValue === null ? undefined : String(priceValue);

    if (value === undefined) {
      return { status: 'unknown', detail: `path "${config.path}" not found in JSON response`, price };
    }
    const inStock = value === config.inStockValue;
    return {
      status: inStock ? 'in_stock' : 'out_of_stock',
      detail: `${config.path} = ${JSON.stringify(value)}`,
      price,
    };
  },
};
