import nodemailer from 'nodemailer';
import type { NotifierConfig } from '../config/schema.js';
import type { Notifier } from '../core/types.js';

type EmailConfig = Extract<NotifierConfig, { type: 'email' }>;

export const emailNotifier: Notifier<EmailConfig> = {
  type: 'email',
  async send(config, message) {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass ?? '' } : undefined,
    });
    await transport.sendMail({
      from: config.from,
      to: config.to,
      subject: message.title,
      text: `${message.body}\n\n${message.url}`,
    });
  },
};
