import type { CheckConfig } from '../config/schema.js';
import type { CheckContext, CheckResult } from '../core/types.js';
import { jsonChecker } from './json.js';
import { playwrightChecker } from './playwright.js';
import { selectorChecker } from './selector.js';
import { shopifyChecker } from './shopify.js';

export async function runChecker(config: CheckConfig, ctx: CheckContext): Promise<CheckResult> {
  switch (config.type) {
    case 'selector':
      return selectorChecker.check(config, ctx);
    case 'playwright':
      return playwrightChecker.check(config, ctx);
    case 'json':
      return jsonChecker.check(config, ctx);
    case 'shopify':
      return shopifyChecker.check(config, ctx);
  }
}
