import { z } from 'zod';
import { DURATION_PATTERN } from './duration.js';

const duration = z.string().regex(DURATION_PATTERN, 'duration like 30s, 5m, 1h');

export const matchRulesSchema = z
  .object({
    /** Match if text contains ANY of these (case-insensitive). */
    contains: z.array(z.string()).optional(),
    /** Match only if text contains NONE of these. */
    notContains: z.array(z.string()).optional(),
    /** Match if this regex (case-insensitive) tests true. */
    matches: z.string().optional(),
  })
  .strict()
  .refine((r) => r.contains || r.notContains || r.matches, {
    message: 'match rules need at least one of contains / notContains / matches',
  });
export type MatchRules = z.infer<typeof matchRulesSchema>;

export const httpOptionsSchema = z
  .object({
    headers: z.record(z.string(), z.string()).optional(),
    userAgent: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();
export type HttpOptions = z.infer<typeof httpOptionsSchema>;

const elementRules = {
  /** CSS selector of the element that carries stock state. */
  selector: z.string(),
  /** "text": classify element text. "exists": element present ⇒ in stock. */
  mode: z.enum(['text', 'exists']).default('text'),
  /** exists mode only: element present ⇒ OUT of stock (e.g. a "Sold out" badge). */
  invert: z.boolean().default(false),
  /** text mode: read this attribute instead of textContent. */
  attribute: z.string().optional(),
  inStock: matchRulesSchema.optional(),
  outOfStock: matchRulesSchema.optional(),
  /** Optional CSS selector for price text, included in notifications. */
  priceSelector: z.string().optional(),
};

export const selectorCheckSchema = z
  .object({
    type: z.literal('selector'),
    ...elementRules,
    http: httpOptionsSchema.optional(),
  })
  .strict();

export const playwrightCheckSchema = z
  .object({
    type: z.literal('playwright'),
    ...elementRules,
    /** Selector to wait for before evaluating (for JS-rendered pages). */
    waitFor: z.string().optional(),
    timeoutMs: z.number().int().positive().default(30_000),
  })
  .strict();

export const jsonCheckSchema = z
  .object({
    type: z.literal('json'),
    /** JSON endpoint. Defaults to the watch URL. */
    endpoint: z.string().url().optional(),
    /** Dot path, e.g. "product.variants[0].available" */
    path: z.string(),
    /** Value at `path` that means in stock. Default: true */
    inStockValue: z.union([z.boolean(), z.string(), z.number()]).default(true),
    pricePath: z.string().optional(),
    http: httpOptionsSchema.optional(),
  })
  .strict();

export const shopifyCheckSchema = z
  .object({
    type: z.literal('shopify'),
    /** Variant title or numeric id. Omit ⇒ any variant available. */
    variant: z.string().optional(),
    http: httpOptionsSchema.optional(),
  })
  .strict();

export const checkSchema = z.discriminatedUnion('type', [
  selectorCheckSchema,
  playwrightCheckSchema,
  jsonCheckSchema,
  shopifyCheckSchema,
]);
export type CheckConfig = z.infer<typeof checkSchema>;
export type SelectorCheckConfig = z.infer<typeof selectorCheckSchema>;
export type PlaywrightCheckConfig = z.infer<typeof playwrightCheckSchema>;
export type JsonCheckConfig = z.infer<typeof jsonCheckSchema>;
export type ShopifyCheckConfig = z.infer<typeof shopifyCheckSchema>;

export const notifierSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('ntfy'),
      server: z.string().url().default('https://ntfy.sh'),
      topic: z.string(),
      token: z.string().optional(),
    })
    .strict(),
  z.object({ type: z.literal('discord'), webhookUrl: z.string().url() }).strict(),
  z.object({ type: z.literal('telegram'), botToken: z.string(), chatId: z.string() }).strict(),
  z
    .object({
      type: z.literal('email'),
      host: z.string(),
      port: z.number().int().positive().default(465),
      secure: z.boolean().default(true),
      user: z.string().optional(),
      pass: z.string().optional(),
      from: z.string(),
      to: z.union([z.string(), z.array(z.string())]),
    })
    .strict(),
  z
    .object({
      type: z.literal('imessage'),
      /** Phone number or Apple ID email of the recipient. */
      to: z.string(),
    })
    .strict(),
]);
export type NotifierConfig = z.infer<typeof notifierSchema>;
export type NotifierType = NotifierConfig['type'];

export const notifyEventSchema = z.enum(['restock', 'sold_out', 'error']);
export type NotifyEvent = z.infer<typeof notifyEventSchema>;

export const watchSchema = z
  .object({
    name: z.string().min(1),
    url: z.string().url(),
    interval: duration.optional(),
    check: checkSchema,
    /** Notifier names. Omit ⇒ all configured notifiers. */
    notify: z.array(z.string()).optional(),
    notifyOn: z.array(notifyEventSchema).default(['restock']),
    enabled: z.boolean().default(true),
  })
  .strict();
export type WatchConfig = z.infer<typeof watchSchema>;

export const defaultsSchema = z
  .object({
    interval: duration.default('5m'),
    /** ±fraction applied to every interval so polling isn't perfectly periodic. */
    jitter: z.number().min(0).max(1).default(0.1),
    /** Consecutive failed checks before an "error" notification fires. */
    errorThreshold: z.number().int().positive().default(3),
    userAgent: z.string().optional(),
    /** History entries kept per watch. */
    historyLimit: z.number().int().positive().default(50),
  })
  .strict();

export const configSchema = z
  .object({
    defaults: defaultsSchema,
    stateFile: z.string().default('./data/state.json'),
    notifiers: z.record(z.string(), notifierSchema).default({}),
    watches: z.array(watchSchema).min(1),
  })
  .strict();
export type Config = z.infer<typeof configSchema>;
