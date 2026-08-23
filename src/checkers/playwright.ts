import type { PlaywrightCheckConfig } from '../config/schema.js';
import type { Checker, CheckContext, CheckResult } from '../core/types.js';
import { collapseWhitespace, truncate } from '../util/text.js';
import { DEFAULT_USER_AGENT } from './fetch.js';
import { evaluateExists, evaluateText } from './rules.js';

type PlaywrightModule = typeof import('playwright');

let playwrightModule: Promise<PlaywrightModule> | undefined;

async function loadPlaywright(): Promise<PlaywrightModule> {
  playwrightModule ??= import('playwright').catch((err: unknown) => {
    playwrightModule = undefined;
    throw new Error(`playwright is unavailable (${(err as Error).message}). Run: npx playwright install chromium`);
  });
  return playwrightModule;
}

export const playwrightChecker: Checker<PlaywrightCheckConfig> = {
  type: 'playwright',
  async check(config, ctx: CheckContext): Promise<CheckResult> {
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ userAgent: ctx.userAgent ?? DEFAULT_USER_AGENT, locale: 'en-US' });
      await page.goto(ctx.url, { waitUntil: 'domcontentloaded', timeout: config.timeoutMs });
      if (config.waitFor) {
        await page.waitForSelector(config.waitFor, { timeout: config.timeoutMs });
      }

      const price = config.priceSelector
        ? collapseWhitespace((await page.locator(config.priceSelector).first().textContent().catch(() => null)) ?? '') || undefined
        : undefined;

      const locator = page.locator(config.selector);
      const count = await locator.count();

      if (config.mode === 'exists') {
        const found = count > 0;
        return {
          status: evaluateExists(found, config.invert),
          detail: found ? `found ${count}× "${config.selector}"` : `no element matches "${config.selector}"`,
          price,
        };
      }
      if (count === 0) {
        return { status: 'unknown', detail: `selector "${config.selector}" matched nothing after render`, price };
      }
      const first = locator.first();
      const text = config.attribute ? ((await first.getAttribute(config.attribute)) ?? '') : await first.innerText();
      return { status: evaluateText(text, config), detail: truncate(collapseWhitespace(text)), price };
    } finally {
      await browser.close();
    }
  },
};
