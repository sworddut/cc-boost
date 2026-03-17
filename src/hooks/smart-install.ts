#!/usr/bin/env node
/**
 * smart-install.ts — Run at SessionStart (Setup hook).
 *
 * Ensures plugin dependencies are installed. Uses a version marker
 * file to skip installation when already up-to-date.
 *
 * Outputs only to stderr (progress/errors) and outputs valid JSON to
 * stdout for the Claude Code hook contract.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { resolvePluginRoot, getClaudeSettingsPath } from '../shared/paths.js';

function isDisabled(): boolean {
  try {
    const settingsPath = getClaudeSettingsPath();
    if (!existsSync(settingsPath)) return false;
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    return settings?.enabledPlugins?.['cc-boost'] === false;
  } catch { return false; }
}

if (isDisabled()) {
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
  process.exit(0);
}

const ROOT = resolvePluginRoot(import.meta.url);
const MARKER = join(ROOT, '.install-version');

function needsInstall(): boolean {
  if (!existsSync(join(ROOT, 'node_modules'))) return true;
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    const marker = JSON.parse(readFileSync(MARKER, 'utf-8'));
    return pkg.version !== marker.version;
  } catch { return true; }
}

try {
  if (needsInstall()) {
    process.stderr.write('[cc-boost] Installing dependencies...\n');
    execSync('npm install --production', {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    writeFileSync(MARKER, JSON.stringify({ version: pkg.version, installedAt: new Date().toISOString() }));
    process.stderr.write(`[cc-boost] Dependencies installed (v${pkg.version})\n`);
  }
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`[cc-boost] Install failed: ${msg}\n`);
  // Still output valid JSON — don't block the user
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
  process.exit(0);
}
