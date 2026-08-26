import type { NotifierConfig } from '../config/schema.js';
import type { Notification, Notifier } from '../core/types.js';

type NtfyConfig = Extract<NotifierConfig, { type: 'ntfy' }>;

const PRIORITY: Record<Notification['priority'], string> = { low: '2', default: '3', high: '5' };

export const ntfyNotifier: Notifier<NtfyConfig> = {
  type: 'ntfy',
  async send(config, message) {
    const headers: Record<string, string> = {
      title: message.title,
      priority: PRIORITY[message.priority],
      click: message.url,
      tags: message.priority === 'high' ? 'shopping_bags,tada' : 'shopping_bags',
    };
    if (config.token) headers.authorization = `Bearer ${config.token}`;

    const res = await fetch(`${config.server.replace(/\/$/, '')}/${encodeURIComponent(config.topic)}`, {
      method: 'POST',
      headers,
      body: message.body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`ntfy responded HTTP ${res.status}`);
  },
};
