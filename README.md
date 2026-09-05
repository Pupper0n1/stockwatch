# stockwatch

Self-hosted **back-in-stock watcher**. Point it at product pages, it polls them on a schedule, works out whether the item is in stock, and pings your phone the moment it flips from sold out to available.

```
🟢 Back in stock: Fatal Attraction Tee
Fatal Attraction Tee / L: available — 30.00
https://www.deathwishcoffee.com/products/fatal-attraction-tee
```

- **Stock-aware, not diff-aware.** Classifies the *stock state* of one element or API field instead of diffing whole pages, so price ticks and ad rotations don't wake you up.
- **Four checkers.** `shopify` (zero config, uses the store's public product JSON), `selector` (static HTML + CSS selector), `json` (the hidden API a page calls), `playwright` (real headless Chromium for JS-rendered / bot-protected pages).
- **Five notifiers.** ntfy push, Discord, Telegram, email, iMessage. Fan-out per watch.
- **Self-healing signals.** Consecutive failures (blocked, selector rot) trigger an *error* alert instead of silently reporting "out of stock" forever.
- **Boring where it counts.** Typed YAML config (zod), `${ENV}` interpolation, atomic JSON state, jittered intervals with backoff, graceful shutdown, Docker + launchd recipes.

## Quick start

```bash
git clone https://github.com/Pupper0n1/stockwatch && cd stockwatch
npm install && npm run build
cp .env.example .env            # fill in what you use
node dist/index.js init         # writes stockwatch.yaml from the example
node dist/index.js check "Example hoodie"   # dry-run one watch, no notifications
node dist/index.js test-notify  # make sure the pings land
node dist/index.js run          # daemon
```

For the `playwright` checker also run `npx playwright install chromium` once.

### CLI

| Command | What it does |
| --- | --- |
| `run [--once]` | Watch everything until Ctrl-C. `--once` = single pass, exit 2 if any check failed (handy for cron / CI). |
| `check <name>` | Run one watch now, print the raw `{ status, detail, price }`, don't notify or save. Exit 2 on `unknown`. Use this while authoring selectors. |
| `status` | Table of every watch: status, price, last checked / changed, error streak. |
| `test-notify [name]` | Send a test message to one or all notifiers. |
| `validate` | Parse the config and print problems with paths. |
| `init` | Drop a starter `stockwatch.yaml`. |

Global flags: `-c, --config <path>` (default `stockwatch.yaml`), `-v` for debug logs. `LOG_FORMAT=json` for machine logs; `LOG_LEVEL` also honoured. A `.env` next to the config is loaded automatically.

## Configuration

Full annotated example: [`stockwatch.example.yaml`](./stockwatch.example.yaml). Every string accepts `${VAR}` and `${VAR:-default}`.

```yaml
defaults:
  interval: 5m        # per-watch override allowed
  jitter: 0.1         # ±10 % so polling isn't perfectly periodic
  errorThreshold: 3   # failed checks in a row before an "error" alert

notifiers:
  phone: { type: ntfy, topic: "${NTFY_TOPIC}" }
  chat:  { type: discord, webhookUrl: "${DISCORD_WEBHOOK_URL}" }

watches:
  - name: Fatal Attraction Tee (L)
    url: https://www.deathwishcoffee.com/products/fatal-attraction-tee
    interval: 2m
    check: { type: shopify, variant: L }
    notify: [phone]                     # omit ⇒ all notifiers
    notifyOn: [restock, sold_out]       # default [restock]
```

> Quote values that contain `${VAR}` when using `{ }` / `[ ]` flow syntax — YAML otherwise reads `{` as a nested map.

### Checkers

**`shopify`** — derives `https://store/products/<handle>.js` from the URL and reads `variants[].available` + price. Works on most Shopify storefronts with zero configuration. `variant:` matches a variant title or id; omit it for "any variant available". The `detail` lists which variants are live.

**`selector`** — fetches the HTML and inspects the first element matching `selector`.
- `mode: text` (default): classifies the element text. With no rules, built-in heuristics apply (`add to cart`, `in stock` vs `sold out`, `currently unavailable`, `notify me`, …). Add `inStock` / `outOfStock` rules (`contains`, `notContains`, `matches` regex) to be explicit; if you give only one side, the other is its complement. Both given and neither matches ⇒ `unknown`, which counts as a failure.
- `mode: exists`: element present ⇒ in stock. `invert: true` flips it for "Sold out" badges.
- `attribute:` reads an attribute instead of text; `priceSelector:` captures a price for the message; `http: { headers, userAgent, timeoutMs }` tunes the request.

**`json`** — GET `endpoint` (or the watch URL), resolve `path` (`items[0].inStock` / `items.0.inStock`), compare with `inStockValue` (default `true`). Find the endpoint in DevTools → Network while the product page loads; it's usually far more stable than markup.

**`playwright`** — same knobs as `selector` (`selector`, `mode`, `invert`, `inStock`, `outOfStock`, `priceSelector`) plus `waitFor` and `timeoutMs`, evaluated inside real Chromium. Use it when the stock widget is rendered client-side or the site serves a bot wall to plain HTTP. Slow (seconds per check) and memory-heavy — give these watches longer intervals.

### Notifiers

| type | fields | notes |
| --- | --- | --- |
| `ntfy` | `topic`, `server` (default `https://ntfy.sh`), `token` | Free phone push. Restocks are sent at high priority with a click-through to the product. |
| `discord` | `webhookUrl` | Rich embed, colour-coded by event. |
| `telegram` | `botToken`, `chatId` | HTML-formatted message. |
| `email` | `host`, `port`, `secure`, `user`, `pass`, `from`, `to` | Any SMTP (Gmail app password works). |
| `imessage` | `to` | macOS only — drives Messages.app via `osascript`. Daemon must run natively, not in Docker. |

Notifier failures are logged and never block other notifiers or the watch loop.

### How state transitions work

| previous → current | result |
| --- | --- |
| *(nothing)* → anything | baseline recorded, **no** notification (adding an already-in-stock item shouldn't ping you) |
| out_of_stock → in_stock | **restock** notification |
| in_stock → out_of_stock | *sold_out* notification if enabled |
| check fails / `unknown` | last known status kept; after `errorThreshold` consecutive failures one *error* alert fires (if enabled), then the interval backs off up to 4× until a check succeeds |

State lives in `data/state.json` (atomic writes, last 50 transitions per watch).

## Running it for real

**Docker (Linux box, NAS, Pi):**

```bash
docker compose up -d --build
docker compose logs -f
```

The image includes Chromium for the `playwright` checker; delete that `RUN` line in the Dockerfile for a much smaller image if you don't need it.

**macOS with launchd** (required for iMessage): see the header of [`deploy/com.stockwatch.plist`](./deploy/com.stockwatch.plist).

**Cron / GitHub Actions:** `stockwatch run --once` does a single pass and exits, so any scheduler works — just persist `data/`.

## Authoring tips

1. Start with `check <name>`. Iterate on the selector until `status` is right and `detail` shows the text you expect.
2. Prefer `shopify` or `json` over `selector`; markup rots, APIs mostly don't.
3. Got `HTTP 403/429`? You're being bot-walled. Lengthen the interval first; switch to `playwright` if that isn't enough. Residential IPs (your home box) fare far better than cloud IPs.
4. Never poll aggressively. 1–2 minutes is plenty for most drops and keeps you off block lists.

## Development

```bash
npm run dev -- -c stockwatch.yaml check "Example hoodie"   # run from source with tsx
npm run typecheck && npm test                              # strict TS + vitest
```

```
src/
  index.ts          CLI (commander)
  config/           zod schema, YAML loader, ${ENV} interpolation, durations
  core/             engine (transition logic), scheduler, state store, message templates
  checkers/         shopify · selector · json · playwright, shared text/exists rules
  notifiers/        ntfy · discord · telegram · email · imessage, fan-out dispatcher
```

Adding a checker or notifier = one file + one `case` in the corresponding `index.ts` + a schema entry. Everything is a discriminated union, so the compiler tells you what you missed.

## Roadmap

- [ ] Web dashboard (status + history sparkline) — `stockwatch serve`
- [ ] Add/remove watches from Telegram/Discord chat commands
- [ ] Price-drop alerts (`notifyOn: [price_drop]`, threshold)
- [ ] Shared Chromium instance across playwright watches
- [ ] Per-site recipe presets (`preset: bestbuy`)

## License

MIT
