import type { ShopifyCheckConfig } from '../config/schema.js';
import type { Checker, CheckContext, CheckResult } from '../core/types.js';
import { fetchJson } from './fetch.js';

interface ShopifyVariant {
  id: number;
  title: string;
  available: boolean;
  /** Cents. */
  price: number;
  sku?: string | null;
}

interface ShopifyProduct {
  title: string;
  available: boolean;
  variants: ShopifyVariant[];
}

/** https://shop.example/products/<handle>[/...] → https://shop.example/products/<handle>.js */
export function shopifyProductEndpoint(url: string): string {
  const parsed = new URL(url);
  const match = /\/products\/([^/?#]+)/.exec(parsed.pathname);
  if (!match) throw new Error(`Not a Shopify product URL (expected /products/<handle>): ${url}`);
  return `${parsed.origin}/products/${match[1]}.js`;
}

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function isShopifyProduct(value: unknown): value is ShopifyProduct {
  return typeof value === 'object' && value !== null && Array.isArray((value as ShopifyProduct).variants);
}

export const shopifyChecker: Checker<ShopifyCheckConfig> = {
  type: 'shopify',
  async check(config, ctx: CheckContext): Promise<CheckResult> {
    const endpoint = shopifyProductEndpoint(ctx.url);
    const data = await fetchJson(endpoint, config.http, ctx.userAgent);
    if (!isShopifyProduct(data)) {
      return { status: 'unknown', detail: `${endpoint} did not return a Shopify product payload` };
    }

    if (config.variant) {
      const variant = data.variants.find((v) => v.title === config.variant || String(v.id) === config.variant);
      if (!variant) {
        const titles = data.variants.map((v) => v.title).join(', ');
        return { status: 'unknown', detail: `variant "${config.variant}" not found (have: ${titles})` };
      }
      return {
        status: variant.available ? 'in_stock' : 'out_of_stock',
        detail: `${data.title} / ${variant.title}: ${variant.available ? 'available' : 'unavailable'}`,
        price: formatPrice(variant.price),
      };
    }

    const available = data.variants.filter((v) => v.available);
    const cheapest = [...data.variants].sort((a, b) => a.price - b.price)[0];
    return {
      status: available.length > 0 ? 'in_stock' : 'out_of_stock',
      detail:
        available.length > 0
          ? `${data.title}: ${available.length}/${data.variants.length} variants available (${available.map((v) => v.title).join(', ')})`
          : `${data.title}: all ${data.variants.length} variants unavailable`,
      price: cheapest ? formatPrice(cheapest.price) : undefined,
    };
  },
};
