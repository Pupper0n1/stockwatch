import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { NotifierConfig } from '../config/schema.js';
import type { Notifier } from '../core/types.js';

type IMessageConfig = Extract<NotifierConfig, { type: 'imessage' }>;

const execFileAsync = promisify(execFile);
// Works from both src/ (tsx) and dist/ (compiled) — same depth.
const SCRIPT_PATH = fileURLToPath(new URL('../../assets/imessage.applescript', import.meta.url));

export const imessageNotifier: Notifier<IMessageConfig> = {
  type: 'imessage',
  async send(config, message) {
    if (process.platform !== 'darwin') {
      throw new Error('imessage notifier only works on macOS with Messages.app signed in');
    }
    const text = `${message.title}\n${message.body}\n${message.url}`;
    // Message + recipient are passed as argv, never interpolated into the script.
    await execFileAsync('osascript', [SCRIPT_PATH, text, config.to], { timeout: 15_000 });
  },
};
