import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { getLogPath } from './paths.js';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function write(level: LogLevel, tag: string, message: string): void {
  try {
    const logPath = getLogPath();
    const dir = dirname(logPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const line = `${new Date().toISOString()} [${level}] [${tag}] ${message}\n`;
    appendFileSync(logPath, line);
  } catch {
    // Never throw from logger — it would break hooks
  }
}

export const logger = {
  debug: (tag: string, msg: string) => write('DEBUG', tag, msg),
  info:  (tag: string, msg: string) => write('INFO',  tag, msg),
  warn:  (tag: string, msg: string) => write('WARN',  tag, msg),
  error: (tag: string, msg: string) => write('ERROR', tag, msg),
};
