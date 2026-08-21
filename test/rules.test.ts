import { describe, expect, it } from 'vitest';
import { evaluateExists, evaluateText, matchesRules } from '../src/checkers/rules.js';

describe('matchesRules', () => {
  it('contains is case/whitespace-insensitive and OR-ed', () => {
    expect(matchesRules('  ADD  to\nCart ', { contains: ['add to cart', 'buy'] })).toBe(true);
    expect(matchesRules('Sold out', { contains: ['add to cart'] })).toBe(false);
  });
  it('notContains rejects on any hit', () => {
    expect(matchesRules('In stock — ships tomorrow', { notContains: ['sold out'] })).toBe(true);
    expect(matchesRules('Sold out', { notContains: ['sold out'] })).toBe(false);
  });
  it('matches uses a case-insensitive regex', () => {
    expect(matchesRules('Only 3 left', { matches: '^only \\d+ left' })).toBe(true);
  });
  it('all provided conditions must hold', () => {
    expect(matchesRules('Add to cart', { contains: ['add'], notContains: ['cart'] })).toBe(false);
  });
});

describe('evaluateText', () => {
  it('uses heuristics when no rules given', () => {
    expect(evaluateText('Add to Cart', {})).toBe('in_stock');
    expect(evaluateText('Currently unavailable.', {})).toBe('out_of_stock');
    expect(evaluateText('Sold Out', {})).toBe('out_of_stock');
    expect(evaluateText('Lorem ipsum', {})).toBe('unknown');
  });
  it('out-of-stock heuristics win over in-stock words', () => {
    expect(evaluateText('Unavailable — notify me when available', {})).toBe('out_of_stock');
  });
  it('only inStock rules ⇒ complement is out_of_stock', () => {
    const rules = { inStock: { contains: ['add to cart'] } };
    expect(evaluateText('Add to cart', rules)).toBe('in_stock');
    expect(evaluateText('anything else', rules)).toBe('out_of_stock');
  });
  it('only outOfStock rules ⇒ complement is in_stock', () => {
    const rules = { outOfStock: { contains: ['sold out'] } };
    expect(evaluateText('Sold out', rules)).toBe('out_of_stock');
    expect(evaluateText('$49.99', rules)).toBe('in_stock');
  });
  it('both rules and neither matches ⇒ unknown', () => {
    const rules = { inStock: { contains: ['add to cart'] }, outOfStock: { contains: ['sold out'] } };
    expect(evaluateText('Loading…', rules)).toBe('unknown');
  });
});

describe('evaluateExists', () => {
  it('present ⇒ in stock unless inverted', () => {
    expect(evaluateExists(true, false)).toBe('in_stock');
    expect(evaluateExists(false, false)).toBe('out_of_stock');
    expect(evaluateExists(true, true)).toBe('out_of_stock');
    expect(evaluateExists(false, true)).toBe('in_stock');
  });
});
