import pino, { type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string = process.env.LOG_LEVEL ?? 'info'): Logger {
  const pretty = process.stdout.isTTY && process.env.LOG_FORMAT !== 'json';
  return pino({
    level,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  });
}
