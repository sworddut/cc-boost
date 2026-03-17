#!/usr/bin/env node
const __importMetaUrl = require("url").pathToFileURL(__filename).href;
"use strict";

// src/hooks/smart-install.ts
var import_fs2 = require("fs");
var import_child_process = require("child_process");
var import_path2 = require("path");

// src/shared/paths.ts
var import_fs = require("fs");
var import_path = require("path");
var import_os = require("os");
var import_url = require("url");
function resolvePluginRoot(callerFilename) {
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    const r = process.env.CLAUDE_PLUGIN_ROOT;
    if ((0, import_fs.existsSync)((0, import_path.join)(r, "package.json"))) return r;
  }
  if (callerFilename) {
    try {
      const scriptDir = (0, import_path.dirname)(
        callerFilename.startsWith("file:") ? (0, import_url.fileURLToPath)(callerFilename) : callerFilename
      );
      const candidate = (0, import_path.resolve)(scriptDir, "..");
      if ((0, import_fs.existsSync)((0, import_path.join)(candidate, "package.json"))) return candidate;
    } catch {
    }
  }
  const xdg = (0, import_path.join)((0, import_os.homedir)(), ".config", "claude", "plugins", "marketplaces", "cc-boost", "plugin");
  if ((0, import_fs.existsSync)((0, import_path.join)(xdg, "package.json"))) return xdg;
  return (0, import_path.join)((0, import_os.homedir)(), ".claude", "plugins", "marketplaces", "cc-boost", "plugin");
}
function getClaudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR ?? (0, import_path.join)((0, import_os.homedir)(), ".claude");
}
function getClaudeSettingsPath() {
  return (0, import_path.join)(getClaudeConfigDir(), "settings.json");
}

// src/hooks/smart-install.ts
function isDisabled() {
  try {
    const settingsPath = getClaudeSettingsPath();
    if (!(0, import_fs2.existsSync)(settingsPath)) return false;
    const settings = JSON.parse((0, import_fs2.readFileSync)(settingsPath, "utf-8"));
    return settings?.enabledPlugins?.["cc-boost"] === false;
  } catch {
    return false;
  }
}
if (isDisabled()) {
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + "\n");
  process.exit(0);
}
var ROOT = resolvePluginRoot(__importMetaUrl);
var MARKER = (0, import_path2.join)(ROOT, ".install-version");
function needsInstall() {
  if (!(0, import_fs2.existsSync)((0, import_path2.join)(ROOT, "node_modules"))) return true;
  try {
    const pkg = JSON.parse((0, import_fs2.readFileSync)((0, import_path2.join)(ROOT, "package.json"), "utf-8"));
    const marker = JSON.parse((0, import_fs2.readFileSync)(MARKER, "utf-8"));
    return pkg.version !== marker.version;
  } catch {
    return true;
  }
}
try {
  if (needsInstall()) {
    process.stderr.write("[cc-boost] Installing dependencies...\n");
    (0, import_child_process.execSync)("npm install --production", {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "inherit"]
    });
    const pkg = JSON.parse((0, import_fs2.readFileSync)((0, import_path2.join)(ROOT, "package.json"), "utf-8"));
    (0, import_fs2.writeFileSync)(MARKER, JSON.stringify({ version: pkg.version, installedAt: (/* @__PURE__ */ new Date()).toISOString() }));
    process.stderr.write(`[cc-boost] Dependencies installed (v${pkg.version})
`);
  }
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + "\n");
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`[cc-boost] Install failed: ${msg}
`);
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + "\n");
  process.exit(0);
}
