#!/usr/bin/env node
/**
 * smart-install.js — Run at SessionStart (Setup hook).
 *
 * Ensures plugin dependencies are installed. Uses a version marker
 * file to skip installation when already up-to-date.
 *
 * Outputs only to stderr (progress/errors) and outputs valid JSON to
 * stdout for the Claude Code hook contract.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

// Resolve plugin root (handle missing CLAUDE_PLUGIN_ROOT on Linux/Stop hooks)
function resolveRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    const r = process.env.CLAUDE_PLUGIN_ROOT;
    if (existsSync(join(r, 'package.json'))) return r;
  }
  try {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const candidate = join(scriptDir, '..');
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  } catch { /* ignore */ }
  const legacy = join(homedir(), '.claude', 'plugins', 'marketplaces', 'cc-boost', 'plugin');
  return legacy;
}

// Check if plugin is disabled in Claude Code settings
function isDisabled() {
  try {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    const settingsPath = join(configDir, 'settings.json');
    if (!existsSync(settingsPath)) return false;
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    return settings?.enabledPlugins?.['cc-boost'] === false;
  } catch { return false; }
}

if (isDisabled()) {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  process.exit(0);
}

const ROOT = resolveRoot();
const MARKER = join(ROOT, '.install-version');

function needsInstall() {
  if (!existsSync(join(ROOT, 'node_modules'))) return true;
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    const marker = JSON.parse(readFileSync(MARKER, 'utf-8'));
    return pkg.version !== marker.version;
  } catch { return true; }
}

try {
  if (needsInstall()) {
    console.error('[cc-boost] Installing dependencies...');
    execSync('npm install --production', {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    writeFileSync(MARKER, JSON.stringify({ version: pkg.version, installedAt: new Date().toISOString() }));
    console.error(`[cc-boost] Dependencies installed (v${pkg.version})`);
  }
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
} catch (e) {
  console.error('[cc-boost] Install failed:', e.message);
  // Still output valid JSON — don't block the user
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  process.exit(0);
}
