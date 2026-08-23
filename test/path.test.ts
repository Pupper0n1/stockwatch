import { describe, expect, it } from 'vitest';
import { getPath } from '../src/checkers/path.js';
import { shopifyProductEndpoint } from '../src/checkers/shopify.js';

describe('getPath', () => {
  const data = { product: { variants: [{ available: false }, { available: true, price: 1999 }] }, ok: null };
  it('walks dots and brackets', () => {
    expect(getPath(data, 'product.variants[1].available')).toBe(true);
    expect(getPath(data, 'product.variants.1.price')).toBe(1999);
  });
  it('returns undefined for missing hops, null for null leaves', () => {
    expect(getPath(data, 'product.nope.deeper')).toBeUndefined();
    expect(getPath(data, 'product.variants[9].available')).toBeUndefined();
    expect(getPath(data, 'ok')).toBeNull();
  });
});

describe('shopifyProductEndpoint', () => {
  it('derives the .js endpoint from a product URL', () => {
    expect(shopifyProductEndpoint('https://shop.example.com/products/hoodie?variant=1#x')).toBe(
      'https://shop.example.com/products/hoodie.js',
    );
    expect(shopifyProductEndpoint('https://shop.example.com/collections/all/products/hoodie')).toBe(
      'https://shop.example.com/products/hoodie.js',
    );
  });
  it('rejects non-product URLs', () => {
    expect(() => shopifyProductEndpoint('https://shop.example.com/collections/all')).toThrow(/Not a Shopify/);
  });
});
