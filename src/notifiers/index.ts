import type { Config, NotifierConfig, WatchConfig } from '../config/schema.js';
import type { Notification } from '../core/types.js';
import type { Logger } from '../util/logger.js';
import { errorMessage } from '../util/text.js';
import { discordNotifier } from './discord.js';
import { emailNotifier } from './email.js';
import { imessageNotifier } from './imessage.js';
import { ntfyNotifier } from './ntfy.js';
import { telegramNotifier } from './telegram.js';

export async function sendNotification(config: NotifierConfig, message: Notification): Promise<void> {
  switch (config.type) {
    case 'ntfy':
      return ntfyNotifier.send(config, message);
    case 'discord':
      return discordNotifier.send(config, message);
    case 'telegram':
      return telegramNotifier.send(config, message);
    case 'email':
      return emailNotifier.send(config, message);
    case 'imessage':
      return imessageNotifier.send(config, message);
  }
}

/** Notifier names a watch should hit: its own list, else every configured notifier. */
export function resolveNotifierNames(watch: WatchConfig, config: Config): string[] {
  return watch.notify ?? Object.keys(config.notifiers);
}

/** Fan out to every notifier; one failure never blocks the others. */
export function createDispatcher(config: Config, log: Logger) {
  return async (watch: WatchConfig, message: Notification): Promise<void> => {
    const names = resolveNotifierNames(watch, config);
    if (names.length === 0) {
      log.warn({ watch: watch.name }, 'no notifiers configured — notification dropped');
      return;
    }
    const results = await Promise.allSettled(
      names.map(async (name) => {
        await sendNotification(config.notifiers[name], message);
        log.info({ watch: watch.name, notifier: name }, 'notification sent');
      }),
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        log.error({ watch: watch.name, notifier: names[i], err: errorMessage(r.reason) }, 'notification failed');
      }
    });
  };
}
