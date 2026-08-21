import type { MatchRules } from '../config/schema.js';
import type { StockStatus } from '../core/types.js';

/** Zero-config heuristics. Out-of-stock phrases are checked first — they're more specific. */
export const DEFAULT_OUT_OF_STOCK_PHRASES = [
  'out of stock',
  'sold out',
  'currently unavailable',
  'temporarily unavailable',
  'temporarily out',
  'notify me when',
  'email me when',
  'email when available',
  'back-order',
  'backorder',
  'coming soon',
  'not available',
  'unavailable',
];

export const DEFAULT_IN_STOCK_PHRASES = [
  'add to cart',
  'add to bag',
  'add to basket',
  'in stock',
  'buy now',
  'available',
  'ready to ship',
];

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function matchesRules(text: string, rules: MatchRules): boolean {
  const t = normalizeText(text);
  if (rules.contains && !rules.contains.some((s) => t.includes(normalizeText(s)))) return false;
  if (rules.notContains && rules.notContains.some((s) => t.includes(normalizeText(s)))) return false;
  if (rules.matches && !new RegExp(rules.matches, 'i').test(text)) return false;
  return true;
}

export interface TextRules {
  inStock?: MatchRules;
  outOfStock?: MatchRules;
}

/**
 * Classify element text.
 * - Custom rules: outOfStock checked first, then inStock. If only one side is given,
 *   the other side is its complement. Both given and neither matches ⇒ unknown.
 * - No rules: built-in phrase heuristics.
 */
export function evaluateText(text: string, rules: TextRules): StockStatus {
  const { inStock, outOfStock } = rules;
  if (inStock || outOfStock) {
    if (outOfStock && matchesRules(text, outOfStock)) return 'out_of_stock';
    if (inStock && matchesRules(text, inStock)) return 'in_stock';
    if (inStock && !outOfStock) return 'out_of_stock';
    if (outOfStock && !inStock) return 'in_stock';
    return 'unknown';
  }
  const t = normalizeText(text);
  if (DEFAULT_OUT_OF_STOCK_PHRASES.some((p) => t.includes(p))) return 'out_of_stock';
  if (DEFAULT_IN_STOCK_PHRASES.some((p) => t.includes(p))) return 'in_stock';
  return 'unknown';
}

/** exists mode: element present ⇒ in stock, unless inverted. */
export function evaluateExists(found: boolean, invert: boolean): StockStatus {
  return found !== invert ? 'in_stock' : 'out_of_stock';
}
