import type { NotifierConfig } from '../config/schema.js';
import type { Notification, Notifier } from '../core/types.js';
import { postJson } from './http.js';

type DiscordConfig = Extract<NotifierConfig, { type: 'discord' }>;

const COLOR: Record<Notification['priority'], number> = { low: 0xf1c40f, default: 0xe74c3c, high: 0x2ecc71 };

export const discordNotifier: Notifier<DiscordConfig> = {
  type: 'discord',
  async send(config, message) {
    await postJson(config.webhookUrl, {
      embeds: [
        {
          title: message.title,
          description: message.body,
          url: message.url,
          color: COLOR[message.priority],
          timestamp: new Date().toISOString(),
        },
      ],
    });
  },
};
