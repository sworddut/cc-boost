export const EXIT_CODES = {
  SUCCESS: 0,
  NON_BLOCKING_ERROR: 1,
  BLOCKING_ERROR: 2,
} as const;

export const PLUGIN_NAME = 'cc-boost';
export const PLUGIN_ID = 'cc-boost';

// Token budget: default max characters to pass to Claude (1 token ≈ 4 chars)
export const DEFAULT_TOKEN_BUDGET = 2000; // tokens
export const CHARS_PER_TOKEN = 4;
export const DEFAULT_CHAR_BUDGET = DEFAULT_TOKEN_BUDGET * CHARS_PER_TOKEN; // 8000 chars

// Stdin reading
export const STDIN_SAFETY_TIMEOUT_MS = 30_000;
export const STDIN_PARSE_DELAY_MS = 50;

// Logging
export const LOG_DIR_NAME = '.cc-boost';
export const LOG_FILE_NAME = 'cc-boost.log';
