import * as cheerio from 'cheerio';
import type { SelectorCheckConfig } from '../config/schema.js';
import type { Checker, CheckContext, CheckResult } from '../core/types.js';
import { collapseWhitespace, truncate } from '../util/text.js';
import { fetchText } from './fetch.js';
import { evaluateExists, evaluateText } from './rules.js';

export const selectorChecker: Checker<SelectorCheckConfig> = {
  type: 'selector',
  async check(config, ctx: CheckContext): Promise<CheckResult> {
    const html = await fetchText(ctx.url, config.http, ctx.userAgent);
    const $ = cheerio.load(html);
    const elements = $(config.selector);
    const price = config.priceSelector ? collapseWhitespace($(config.priceSelector).first().text()) || undefined : undefined;

    if (config.mode === 'exists') {
      const found = elements.length > 0;
      return {
        status: evaluateExists(found, config.invert),
        detail: found ? `found ${elements.length}× "${config.selector}"` : `no element matches "${config.selector}"`,
        price,
      };
    }

    if (elements.length === 0) {
      return { status: 'unknown', detail: `selector "${config.selector}" matched nothing — page layout may have changed`, price };
    }
    const first = elements.first();
    const text = config.attribute ? (first.attr(config.attribute) ?? '') : first.text();
    return { status: evaluateText(text, config), detail: truncate(collapseWhitespace(text)), price };
  },
};
