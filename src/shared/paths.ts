import { existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

/**
 * Resolve the plugin root directory.
 *
 * Priority (mirrors claude-mem pattern to handle the CLAUDE_PLUGIN_ROOT bug
 * where Stop hooks and Linux hooks don't receive the env var):
 * 1. CLAUDE_PLUGIN_ROOT env var (set by Claude Code for most hooks)
 * 2. Derived from the calling script's __filename (passed as argument)
 * 3. XDG path: ~/.config/claude/plugins/marketplaces/cc-boost/plugin
 * 4. Legacy path: ~/.claude/plugins/marketplaces/cc-boost/plugin
 */
export function resolvePluginRoot(callerFilename?: string): string {
  // 1. CLAUDE_PLUGIN_ROOT (authoritative when present)
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    const r = process.env.CLAUDE_PLUGIN_ROOT;
    if (existsSync(join(r, 'package.json'))) return r;
  }

  // 2. Derive from caller's file location (scripts/ → parent = plugin root)
  if (callerFilename) {
    try {
      const scriptDir = dirname(
        callerFilename.startsWith('file:') ? fileURLToPath(callerFilename) : callerFilename
      );
      const candidate = resolve(scriptDir, '..');
      if (existsSync(join(candidate, 'package.json'))) return candidate;
    } catch {
      // ignore
    }
  }

  // 3. XDG
  const xdg = join(homedir(), '.config', 'claude', 'plugins', 'marketplaces', 'cc-boost', 'plugin');
  if (existsSync(join(xdg, 'package.json'))) return xdg;

  // 4. Legacy
  return join(homedir(), '.claude', 'plugins', 'marketplaces', 'cc-boost', 'plugin');
}

export function getCcBoostDataDir(): string {
  return join(homedir(), '.cc-boost');
}

export function getLogPath(): string {
  return join(getCcBoostDataDir(), 'cc-boost.log');
}

export function getGlobalConfigPath(): string {
  return join(getCcBoostDataDir(), 'config.json');
}

export function getClaudeConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
}

export function getClaudeSettingsPath(): string {
  return join(getClaudeConfigDir(), 'settings.json');
}
