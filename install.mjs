#!/usr/bin/env node
/**
 * install.mjs — One-click installer for cc-boost
 *
 * 1. Copies plugin/ to ~/.claude/plugins/marketplaces/cc-boost/plugin
 * 2. Merges hooks into ~/.claude/settings.json  (non-destructive)
 * 3. Runs npm install --production in the plugin dir
 */
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PLUGIN_NAME = 'cc-boost';
const SRC  = join(__dirname, 'plugin');
const DEST = join(homedir(), '.claude', 'plugins', 'marketplaces', PLUGIN_NAME, 'plugin');
const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');

// ── 1. Copy plugin files ──────────────────────────────────────────────────────
console.log(`[cc-boost] Copying plugin to:\n  ${DEST}`);
mkdirSync(DEST, { recursive: true });
cpSync(SRC, DEST, { recursive: true });
console.log('[cc-boost] Copy done.\n');

// ── 2. Merge hooks into settings.json ────────────────────────────────────────
console.log(`[cc-boost] Registering hooks in:\n  ${SETTINGS_PATH}`);

const hooksConfig = JSON.parse(
  readFileSync(join(DEST, 'hooks', 'hooks.json'), 'utf-8')
);

let settings = {};
if (existsSync(SETTINGS_PATH)) {
  try { settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')); } catch { /* start fresh */ }
}
if (!settings.hooks) settings.hooks = {};

for (const [event, newEntries] of Object.entries(hooksConfig.hooks)) {
  if (!settings.hooks[event]) settings.hooks[event] = [];

  for (const newEntry of newEntries) {
    // Deduplicate: skip if any hook command from this entry is already registered
    const alreadyRegistered = newEntry.hooks.some((h) =>
      settings.hooks[event].some((existing) =>
        existing.hooks?.some((eh) => eh.command === h.command)
      )
    );
    if (!alreadyRegistered) {
      settings.hooks[event].push(newEntry);
    }
  }
}

writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
console.log('[cc-boost] Hooks registered.\n');

// ── 3. Install npm deps ───────────────────────────────────────────────────────
console.log('[cc-boost] Installing plugin dependencies...');
execSync('npm install --production', { cwd: DEST, stdio: 'inherit' });
console.log('[cc-boost] Dependencies installed.\n');

// ── Done ─────────────────────────────────────────────────────────────────────
const version = JSON.parse(readFileSync(join(DEST, 'package.json'), 'utf-8')).version;
console.log(`cc-boost v${version} installed successfully!`);
console.log('Restart Claude Code to activate.');
