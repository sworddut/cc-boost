/**
 * PreToolUse hook entry point.
 *
 * This is the main hook that Claude Code calls before executing any Bash command.
 * It does two things (in priority order):
 *
 * 1. INTERACTIVE INTERCEPT: Detect scaffold commands (create-next-app, vite, etc.)
 *    and block them, asking Claude to relay configuration questions to the user.
 *
 * 2. FILTER WRAP: Wrap the command in a filter pipeline to strip ANSI codes,
 *    fold stack traces, and apply token budget before Claude sees the output.
 */

import { readJsonFromStdin } from './stdin-reader.js';
import { allowWithWrappedCommand, blockWithReason, passthrough } from './hook-response.js';
import { registry } from '../interactive/registry.js';
import { detectInteractiveCommand } from '../interactive/detector.js';
import { buildInteractiveBlockResponse } from '../interactive/handler.js';
import { wrapCommandWithFilter } from '../filter/pipeline.js';
import { loadConfig } from '../config/loader.js';
import { logger } from '../shared/logger.js';
import { EXIT_CODES } from '../shared/constants.js';
import { resolvePluginRoot, getClaudeSettingsPath } from '../shared/paths.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Import framework registrations (side-effect: registers into registry)
import '../interactive/frameworks/next.js';
import '../interactive/frameworks/vite.js';
import '../interactive/frameworks/svelte.js';
import '../interactive/frameworks/remix.js';
import '../interactive/frameworks/angular.js';

interface HookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { command?: string };
  session_id?: string;
  cwd?: string;
}

function isPluginDisabled(): boolean {
  try {
    const settingsPath = getClaudeSettingsPath();
    if (!existsSync(settingsPath)) return false;
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    return settings?.enabledPlugins?.[`${process.env.PLUGIN_ID ?? 'cc-boost'}`] === false;
  } catch {
    return false;
  }
}

function shouldSkipCommand(command: string, config: ReturnType<typeof loadConfig>): boolean {
  const stripped = command.replace(/^(\w+=\S+\s+)*/, '').trim();
  return config.excludeCommands.some(
    exc => stripped === exc || stripped.startsWith(exc + ' ')
  );
}

async function main(): Promise<void> {
  // Silence stderr inside hook — Claude Code shows it as error UI
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (() => true) as typeof process.stderr.write;

  try {
    if (isPluginDisabled()) {
      process.stdout.write(JSON.stringify(passthrough()) + '\n');
      process.exit(EXIT_CODES.SUCCESS);
    }

    const raw = await readJsonFromStdin() as HookInput | undefined;

    if (!raw || raw.tool_name !== 'Bash') {
      process.stdout.write(JSON.stringify(passthrough()) + '\n');
      process.exit(EXIT_CODES.SUCCESS);
    }

    const command = raw.tool_input?.command;
    if (!command || typeof command !== 'string') {
      process.stdout.write(JSON.stringify(passthrough()) + '\n');
      process.exit(EXIT_CODES.SUCCESS);
    }

    const config = loadConfig(raw.cwd);

    if (config.disabled) {
      process.stdout.write(JSON.stringify(passthrough()) + '\n');
      process.exit(EXIT_CODES.SUCCESS);
    }

    // --- Path 1: Interactive command detection ---
    for (const entry of registry.getAll()) {
      const result = detectInteractiveCommand(command, entry);
      if (result.matched && !result.configured) {
        logger.info('HOOK', `Intercepted interactive command: ${command.slice(0, 80)}`);
        const response = buildInteractiveBlockResponse(command, result.entry);
        process.stdout.write(JSON.stringify(response) + '\n');
        process.exit(EXIT_CODES.SUCCESS);
      }
    }

    // --- Path 2: Output filter wrapping ---
    if (shouldSkipCommand(command, config)) {
      process.stdout.write(JSON.stringify(passthrough()) + '\n');
      process.exit(EXIT_CODES.SUCCESS);
    }

    const pluginRoot = resolvePluginRoot(import.meta.url);
    const filterScript = join(pluginRoot, 'scripts', 'filter.cjs');

    if (!existsSync(filterScript)) {
      logger.warn('HOOK', `filter.cjs not found at ${filterScript}, passing through`);
      process.stdout.write(JSON.stringify(passthrough()) + '\n');
      process.exit(EXIT_CODES.SUCCESS);
    }

    const wrapped = wrapCommandWithFilter(command, filterScript, config);
    logger.debug('HOOK', `Wrapping: ${command.slice(0, 60)} → filter`);

    const response = allowWithWrappedCommand(wrapped);
    process.stdout.write(JSON.stringify(response) + '\n');
    process.exit(EXIT_CODES.SUCCESS);

  } catch (err) {
    // Never block the user — on any error, passthrough
    try {
      process.stderr.write = origStderrWrite;
      logger.error('HOOK', `Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
    } catch { /* ignore */ }
    process.stdout.write(JSON.stringify(passthrough()) + '\n');
    process.exit(EXIT_CODES.SUCCESS);
  }
}

main();
