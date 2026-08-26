import type { NotifierConfig } from '../config/schema.js';
import type { Notifier } from '../core/types.js';
import { postJson } from './http.js';

type TelegramConfig = Extract<NotifierConfig, { type: 'telegram' }>;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const telegramNotifier: Notifier<TelegramConfig> = {
  type: 'telegram',
  async send(config, message) {
    await postJson(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      chat_id: config.chatId,
      parse_mode: 'HTML',
      text: `<b>${escapeHtml(message.title)}</b>\n${escapeHtml(message.body)}\n<a href="${message.url}">Open product</a>`,
    });
  },
};
