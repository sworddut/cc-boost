const __importMetaUrl = require("url").pathToFileURL(__filename).href;
"use strict";

// src/shared/constants.ts
var EXIT_CODES = {
  SUCCESS: 0,
  NON_BLOCKING_ERROR: 1,
  BLOCKING_ERROR: 2
};
var DEFAULT_TOKEN_BUDGET = 2e3;
var CHARS_PER_TOKEN = 4;
var DEFAULT_CHAR_BUDGET = DEFAULT_TOKEN_BUDGET * CHARS_PER_TOKEN;
var STDIN_SAFETY_TIMEOUT_MS = 3e4;
var STDIN_PARSE_DELAY_MS = 50;

// src/hooks/stdin-reader.ts
function isStdinAvailable() {
  try {
    const stdin = process.stdin;
    if (stdin.isTTY) return false;
    void stdin.readable;
    return true;
  } catch {
    return false;
  }
}
function tryParseJson(input) {
  const trimmed = input.trim();
  if (!trimmed) return { success: false };
  try {
    return { success: true, value: JSON.parse(trimmed) };
  } catch {
    return { success: false };
  }
}
async function readJsonFromStdin() {
  if (!isStdinAvailable()) return void 0;
  return new Promise((resolve2, reject) => {
    let input = "";
    let resolved = false;
    let parseDelayId = null;
    const cleanup = () => {
      try {
        process.stdin.removeAllListeners("data");
        process.stdin.removeAllListeners("end");
        process.stdin.removeAllListeners("error");
      } catch {
      }
    };
    const resolveWith = (value) => {
      if (resolved) return;
      resolved = true;
      if (parseDelayId) clearTimeout(parseDelayId);
      clearTimeout(safetyId);
      cleanup();
      resolve2(value);
    };
    const rejectWith = (err) => {
      if (resolved) return;
      resolved = true;
      if (parseDelayId) clearTimeout(parseDelayId);
      clearTimeout(safetyId);
      cleanup();
      reject(err);
    };
    const tryResolve = () => {
      const r = tryParseJson(input);
      if (r.success) {
        resolveWith(r.value);
        return true;
      }
      return false;
    };
    const safetyId = setTimeout(() => {
      if (!resolved) {
        if (!tryResolve()) {
          if (input.trim()) {
            rejectWith(new Error(`Incomplete JSON after ${STDIN_SAFETY_TIMEOUT_MS}ms`));
          } else {
            resolveWith(void 0);
          }
        }
      }
    }, STDIN_SAFETY_TIMEOUT_MS);
    try {
      process.stdin.on("data", (chunk) => {
        input += chunk;
        if (parseDelayId) {
          clearTimeout(parseDelayId);
          parseDelayId = null;
        }
        if (tryResolve()) return;
        parseDelayId = setTimeout(tryResolve, STDIN_PARSE_DELAY_MS);
      });
      process.stdin.on("end", () => {
        if (!resolved) tryResolve() || resolveWith(void 0);
      });
      process.stdin.on("error", () => {
        if (!resolved) resolveWith(void 0);
      });
    } catch {
      resolved = true;
      clearTimeout(safetyId);
      cleanup();
      resolve2(void 0);
    }
  });
}

// src/hooks/hook-response.ts
function allowWithWrappedCommand(command) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput: { command }
    }
  };
}
function blockWithReason(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "block",
      reason
    }
  };
}
function passthrough() {
  return { continue: true, suppressOutput: true };
}

// src/interactive/registry.ts
var FrameworkRegistry = class {
  entries = [];
  register(entry) {
    this.entries.push(entry);
  }
  /** Find the first matching framework for a command */
  match(command) {
    return this.entries.find((e) => e.patterns.some((p) => p.test(command))) ?? null;
  }
  getAll() {
    return [...this.entries];
  }
};
var registry = new FrameworkRegistry();

// src/interactive/detector.ts
function detectInteractiveCommand(command, entry) {
  const isMatch = entry.patterns.some((p) => p.test(command));
  if (!isMatch) return { matched: false };
  const isConfigured = entry.answerFlags.some((flag) => command.includes(flag));
  return { matched: true, configured: isConfigured, entry };
}

// src/interactive/handler.ts
function buildInteractiveBlockResponse(originalCommand, entry) {
  const reason = buildBlockReason(originalCommand, entry);
  return blockWithReason(reason);
}
function buildBlockReason(originalCommand, entry) {
  const lines = [];
  lines.push(`[cc-boost] \u68C0\u6D4B\u5230\u4EA4\u4E92\u5F0F\u811A\u624B\u67B6\u547D\u4EE4\uFF0CClaude \u65E0\u6CD5\u76F4\u63A5\u64CD\u4F5C\u952E\u76D8\u9009\u62E9\u754C\u9762\u3002`);
  lines.push("");
  lines.push(`\u8BF7\u5411\u7528\u6237\u786E\u8BA4\u4EE5\u4E0B\u914D\u7F6E\u9879\uFF0C\u7136\u540E\u643A\u5E26\u5BF9\u5E94 flags \u91CD\u65B0\u6267\u884C\u547D\u4EE4\uFF1A`);
  lines.push("");
  lines.push(`\u539F\u59CB\u547D\u4EE4: ${originalCommand}`);
  lines.push(`\u6846\u67B6: ${entry.displayName} (${entry.name})`);
  if (entry.docsUrl) lines.push(`\u6587\u6863: ${entry.docsUrl}`);
  lines.push("");
  lines.push("\u2501\u2501\u2501 \u9700\u8981\u786E\u8BA4\u7684\u914D\u7F6E\u9879 \u2501\u2501\u2501");
  entry.questions.forEach((q, i) => {
    lines.push("");
    lines.push(`${i + 1}. ${q.label}`);
    if (q.description) lines.push(`   \u8BF4\u660E: ${q.description}`);
    if (q.choices) {
      lines.push(`   \u9009\u9879:`);
      q.choices.forEach((c) => {
        lines.push(`     \u2022 ${c.label}  \u2192  ${c.flag}`);
      });
    } else {
      const def = q.default ? "Yes" : "No";
      lines.push(`   \u9ED8\u8BA4: ${def}`);
      lines.push(`   Flag: Yes \u2192 ${q.flagYes}  |  No \u2192 ${q.flagNo}`);
    }
  });
  const defaultFlags = buildDefaultFlags(entry.questions);
  const baseCmd = originalCommand.trim();
  const exampleCmd = defaultFlags.length > 0 ? `${baseCmd} ${defaultFlags.join(" ")}` : baseCmd;
  lines.push("");
  lines.push("\u2501\u2501\u2501 \u5168\u90E8\u4F7F\u7528\u9ED8\u8BA4\u503C\u7684\u53C2\u8003\u547D\u4EE4 \u2501\u2501\u2501");
  lines.push(exampleCmd);
  return lines.join("\n");
}
function buildDefaultFlags(questions) {
  const flags = [];
  for (const q of questions) {
    if (q.choices) {
      continue;
    }
    if (q.default) {
      if (q.flagYes) flags.push(q.flagYes);
    } else {
      if (q.flagNo) flags.push(q.flagNo);
    }
  }
  return flags;
}

// src/filter/command-rules.ts
function getCommandRule(command, config) {
  for (const [pattern, rule] of Object.entries(config.rules)) {
    const strippedCmd = command.replace(/^(\w+=\S+\s+)*/, "").trim();
    if (strippedCmd === pattern || strippedCmd.startsWith(pattern + " ") || strippedCmd.startsWith(pattern + "	")) {
      return rule;
    }
  }
  return null;
}
function applyArgInjection(command, rule) {
  if (!rule.appendArgs?.length) return command;
  const toAdd = rule.appendArgs.filter((arg) => !command.includes(arg));
  if (!toAdd.length) return command;
  return command + " " + toAdd.join(" ");
}

// src/filter/pipeline.ts
function wrapCommandWithFilter(command, filterScriptPath, config) {
  let cmd = command;
  const rule = getCommandRule(command, config);
  if (rule) cmd = applyArgInjection(cmd, rule);
  return `(${cmd}) 2>&1 | node "${filterScriptPath}" --budget=${config.budget}`;
}

// src/config/loader.ts
var import_fs2 = require("fs");
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
function getCcBoostDataDir() {
  return (0, import_path.join)((0, import_os.homedir)(), ".cc-boost");
}
function getLogPath() {
  return (0, import_path.join)(getCcBoostDataDir(), "cc-boost.log");
}
function getGlobalConfigPath() {
  return (0, import_path.join)(getCcBoostDataDir(), "config.json");
}
function getClaudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR ?? (0, import_path.join)((0, import_os.homedir)(), ".claude");
}
function getClaudeSettingsPath() {
  return (0, import_path.join)(getClaudeConfigDir(), "settings.json");
}

// src/config/loader.ts
var DEFAULTS = {
  budget: DEFAULT_TOKEN_BUDGET,
  rules: {
    "npm install": { appendArgs: ["--no-fund", "--no-audit"], filterLines: ["npm warn", "npm notice"] },
    "npm i": { appendArgs: ["--no-fund", "--no-audit"], filterLines: ["npm warn", "npm notice"] },
    "pnpm install": { filterLines: ["Progress:"] },
    "jest": { keepOnlyFailing: true },
    "vitest": { keepOnlyFailing: true },
    "tsc": { filterLines: [] },
    // handled specially
    "eslint": { filterSeverity: ["warning"] },
    "git log": { maxLines: 20 },
    "docker build": { filterLines: [] }
    // handled specially
  },
  stackTrace: {
    foldNodeModules: true,
    foldNodeInternal: true,
    keepUserFrames: "all"
  },
  customFilters: [],
  excludeCommands: ["ls", "pwd", "echo", "cat", "which", "type"],
  disabled: false,
  interactiveCommands: []
};
function loadConfig(cwd) {
  const configs = [];
  const globalPath = getGlobalConfigPath();
  if ((0, import_fs2.existsSync)(globalPath)) {
    try {
      configs.push(JSON.parse((0, import_fs2.readFileSync)(globalPath, "utf-8")));
    } catch {
    }
  }
  if (cwd) {
    const projectPath = (0, import_path2.join)(cwd, ".cc-boost.json");
    if ((0, import_fs2.existsSync)(projectPath)) {
      try {
        configs.push(JSON.parse((0, import_fs2.readFileSync)(projectPath, "utf-8")));
      } catch {
      }
    }
  }
  return configs.reduce(
    (acc, partial) => deepMerge(acc, partial),
    { ...DEFAULTS }
  );
}
function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const val = override[key];
    if (val !== void 0) {
      if (typeof val === "object" && !Array.isArray(val) && val !== null) {
        result[key] = deepMerge(base[key], val);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

// src/shared/logger.ts
var import_fs3 = require("fs");
var import_path3 = require("path");
function write(level, tag, message) {
  try {
    const logPath = getLogPath();
    const dir = (0, import_path3.dirname)(logPath);
    if (!(0, import_fs3.existsSync)(dir)) (0, import_fs3.mkdirSync)(dir, { recursive: true });
    const line = `${(/* @__PURE__ */ new Date()).toISOString()} [${level}] [${tag}] ${message}
`;
    (0, import_fs3.appendFileSync)(logPath, line);
  } catch {
  }
}
var logger = {
  debug: (tag, msg) => write("DEBUG", tag, msg),
  info: (tag, msg) => write("INFO", tag, msg),
  warn: (tag, msg) => write("WARN", tag, msg),
  error: (tag, msg) => write("ERROR", tag, msg)
};

// src/hooks/pre-tool-use.ts
var import_fs4 = require("fs");
var import_path4 = require("path");

// src/interactive/frameworks/next.ts
registry.register({
  name: "create-next-app",
  displayName: "Next.js",
  patterns: [
    /npx\s+create-next-app/,
    /npm\s+create\s+next-app/,
    /pnpm\s+create\s+next-app/,
    /yarn\s+create\s+next-app/
  ],
  answerFlags: [
    "--typescript",
    "--no-typescript",
    "--eslint",
    "--no-eslint",
    "--tailwind",
    "--no-tailwind",
    "--src-dir",
    "--no-src-dir",
    "--app",
    "--no-app",
    "--import-alias",
    "--no-import-alias",
    "--yes",
    "-y"
  ],
  questions: [
    {
      id: "typescript",
      label: "\u662F\u5426\u4F7F\u7528 TypeScript\uFF1F",
      description: "\u63A8\u8350 Yes\uFF08\u7C7B\u578B\u5B89\u5168\uFF0CIDE \u652F\u6301\u66F4\u597D\uFF09",
      default: true,
      flagYes: "--typescript",
      flagNo: "--no-typescript"
    },
    {
      id: "eslint",
      label: "\u662F\u5426\u4F7F\u7528 ESLint\uFF1F",
      description: "\u63A8\u8350 Yes\uFF08\u4EE3\u7801\u8D28\u91CF\u68C0\u67E5\uFF09",
      default: true,
      flagYes: "--eslint",
      flagNo: "--no-eslint"
    },
    {
      id: "tailwind",
      label: "\u662F\u5426\u4F7F\u7528 Tailwind CSS\uFF1F",
      description: "\u9ED8\u8BA4 No",
      default: false,
      flagYes: "--tailwind",
      flagNo: "--no-tailwind"
    },
    {
      id: "src_dir",
      label: "\u662F\u5426\u4F7F\u7528 src/ \u76EE\u5F55\u7ED3\u6784\uFF1F",
      description: "\u9ED8\u8BA4 No\uFF08Yes \u65F6\u4EE3\u7801\u653E\u5728 src/ \u4E0B\uFF09",
      default: false,
      flagYes: "--src-dir",
      flagNo: "--no-src-dir"
    },
    {
      id: "app_router",
      label: "\u662F\u5426\u4F7F\u7528 App Router\uFF1F",
      description: "\u63A8\u8350 Yes\uFF08Next.js 13+ \u65B0\u67B6\u6784\uFF09\uFF0CNo = Pages Router",
      default: true,
      flagYes: "--app",
      flagNo: "--no-app"
    },
    {
      id: "import_alias",
      label: "\u662F\u5426\u81EA\u5B9A\u4E49 import alias\uFF08@/*\uFF09\uFF1F",
      description: "\u9ED8\u8BA4 No\uFF08\u4FDD\u6301 @/* \u9ED8\u8BA4\u522B\u540D\uFF09",
      default: false,
      flagYes: '--import-alias "@/*"',
      flagNo: "--no-import-alias"
    }
  ],
  docsUrl: "https://nextjs.org/docs/app/api-reference/cli/create-next-app"
});

// src/interactive/frameworks/vite.ts
registry.register({
  name: "create-vite",
  displayName: "Vite",
  patterns: [
    /npm\s+create\s+vite/,
    /pnpm\s+create\s+vite/,
    /yarn\s+create\s+vite/,
    /npx\s+create-vite/,
    /bun\s+create\s+vite/
  ],
  answerFlags: [
    "--template",
    "-t"
  ],
  questions: [
    {
      id: "framework",
      label: "\u9009\u62E9\u6846\u67B6",
      description: "\u9009\u62E9\u9879\u76EE\u4F7F\u7528\u7684\u6846\u67B6",
      default: false,
      choices: [
        { value: "vanilla", label: "Vanilla\uFF08\u65E0\u6846\u67B6\uFF09", flag: "--template vanilla" },
        { value: "vanilla-ts", label: "Vanilla + TypeScript", flag: "--template vanilla-ts" },
        { value: "vue", label: "Vue", flag: "--template vue" },
        { value: "vue-ts", label: "Vue + TypeScript", flag: "--template vue-ts" },
        { value: "react", label: "React", flag: "--template react" },
        { value: "react-ts", label: "React + TypeScript", flag: "--template react-ts" },
        { value: "react-swc", label: "React + SWC", flag: "--template react-swc" },
        { value: "react-swc-ts", label: "React + SWC + TypeScript", flag: "--template react-swc-ts" },
        { value: "preact", label: "Preact", flag: "--template preact" },
        { value: "preact-ts", label: "Preact + TypeScript", flag: "--template preact-ts" },
        { value: "lit", label: "Lit", flag: "--template lit" },
        { value: "lit-ts", label: "Lit + TypeScript", flag: "--template lit-ts" },
        { value: "svelte", label: "Svelte", flag: "--template svelte" },
        { value: "svelte-ts", label: "Svelte + TypeScript", flag: "--template svelte-ts" },
        { value: "solid", label: "Solid", flag: "--template solid" },
        { value: "solid-ts", label: "Solid + TypeScript", flag: "--template solid-ts" },
        { value: "qwik", label: "Qwik", flag: "--template qwik" },
        { value: "qwik-ts", label: "Qwik + TypeScript", flag: "--template qwik-ts" }
      ]
    }
  ],
  docsUrl: "https://vitejs.dev/guide/"
});

// src/interactive/frameworks/svelte.ts
registry.register({
  name: "create-svelte",
  displayName: "SvelteKit",
  patterns: [
    /npm\s+create\s+svelte/,
    /pnpm\s+create\s+svelte/,
    /yarn\s+create\s+svelte/,
    /npx\s+create-svelte/
  ],
  answerFlags: [
    "--types",
    "--no-types",
    "--eslint",
    "--no-eslint",
    "--prettier",
    "--no-prettier",
    "--playwright",
    "--no-playwright",
    "--vitest",
    "--no-vitest",
    "--yes",
    "-y"
  ],
  questions: [
    {
      id: "typescript",
      label: "\u662F\u5426\u6DFB\u52A0\u7C7B\u578B\u68C0\u67E5\uFF08TypeScript / JSDoc\uFF09\uFF1F",
      description: "\u63A8\u8350 TypeScript",
      default: true,
      flagYes: "--types ts",
      flagNo: "--no-types"
    },
    {
      id: "eslint",
      label: "\u662F\u5426\u6DFB\u52A0 ESLint\uFF1F",
      description: "\u4EE3\u7801\u8D28\u91CF\u68C0\u67E5\uFF0C\u63A8\u8350 Yes",
      default: true,
      flagYes: "--eslint",
      flagNo: "--no-eslint"
    },
    {
      id: "prettier",
      label: "\u662F\u5426\u6DFB\u52A0 Prettier\uFF1F",
      description: "\u4EE3\u7801\u683C\u5F0F\u5316\uFF0C\u63A8\u8350 Yes",
      default: true,
      flagYes: "--prettier",
      flagNo: "--no-prettier"
    },
    {
      id: "playwright",
      label: "\u662F\u5426\u6DFB\u52A0 Playwright\uFF08E2E \u6D4B\u8BD5\uFF09\uFF1F",
      description: "\u9ED8\u8BA4 No",
      default: false,
      flagYes: "--playwright",
      flagNo: "--no-playwright"
    },
    {
      id: "vitest",
      label: "\u662F\u5426\u6DFB\u52A0 Vitest\uFF08\u5355\u5143\u6D4B\u8BD5\uFF09\uFF1F",
      description: "\u9ED8\u8BA4 No",
      default: false,
      flagYes: "--vitest",
      flagNo: "--no-vitest"
    }
  ],
  docsUrl: "https://kit.svelte.dev/docs/creating-a-project"
});

// src/interactive/frameworks/remix.ts
registry.register({
  name: "create-remix",
  displayName: "Remix",
  patterns: [
    /npx\s+create-remix/,
    /npm\s+create\s+remix/,
    /pnpm\s+create\s+remix/,
    /yarn\s+create\s+remix/
  ],
  answerFlags: [
    "--template",
    "--typescript",
    "--no-typescript",
    "--install",
    "--no-install",
    "--git-init",
    "--no-git-init",
    "--yes",
    "-y"
  ],
  questions: [
    {
      id: "typescript",
      label: "\u662F\u5426\u4F7F\u7528 TypeScript\uFF1F",
      description: "\u63A8\u8350 Yes",
      default: true,
      flagYes: "--typescript",
      flagNo: "--no-typescript"
    },
    {
      id: "install",
      label: "\u662F\u5426\u7ACB\u5373\u5B89\u88C5\u4F9D\u8D56\uFF1F",
      description: "\u63A8\u8350 Yes",
      default: true,
      flagYes: "--install",
      flagNo: "--no-install"
    },
    {
      id: "git",
      label: "\u662F\u5426\u521D\u59CB\u5316 Git \u4ED3\u5E93\uFF1F",
      description: "\u9ED8\u8BA4 No",
      default: false,
      flagYes: "--git-init",
      flagNo: "--no-git-init"
    }
  ],
  docsUrl: "https://remix.run/docs/en/main/other-api/create-remix"
});

// src/interactive/frameworks/angular.ts
registry.register({
  name: "angular-cli",
  displayName: "Angular",
  patterns: [
    /npx\s+@angular\/cli\s+new/,
    /npx\s+@angular\/cli@\S+\s+new/,
    /ng\s+new\s/
  ],
  answerFlags: [
    "--routing",
    "--no-routing",
    "--style",
    "--ssr",
    "--no-ssr",
    "--standalone",
    "--no-standalone",
    "--yes",
    "-y"
  ],
  questions: [
    {
      id: "routing",
      label: "\u662F\u5426\u6DFB\u52A0 Angular Router\uFF1F",
      description: "\u63A8\u8350 Yes\uFF08\u591A\u9875\u9762\u5E94\u7528\u5FC5\u987B\uFF09",
      default: true,
      flagYes: "--routing",
      flagNo: "--no-routing"
    },
    {
      id: "style",
      label: "\u9009\u62E9\u6837\u5F0F\u6587\u4EF6\u683C\u5F0F",
      description: "\u9ED8\u8BA4 CSS",
      default: false,
      choices: [
        { value: "css", label: "CSS", flag: "--style css" },
        { value: "scss", label: "SCSS", flag: "--style scss" },
        { value: "sass", label: "Sass", flag: "--style sass" },
        { value: "less", label: "Less", flag: "--style less" }
      ]
    },
    {
      id: "ssr",
      label: "\u662F\u5426\u542F\u7528 SSR\uFF08\u670D\u52A1\u7AEF\u6E32\u67D3\uFF09\uFF1F",
      description: "\u9ED8\u8BA4 No",
      default: false,
      flagYes: "--ssr",
      flagNo: "--no-ssr"
    },
    {
      id: "standalone",
      label: "\u662F\u5426\u4F7F\u7528 Standalone Components\uFF08\u65E0 NgModule\uFF09\uFF1F",
      description: "\u63A8\u8350 Yes\uFF08Angular 17+ \u65B0\u65B9\u5F0F\uFF09",
      default: true,
      flagYes: "--standalone",
      flagNo: "--no-standalone"
    }
  ],
  docsUrl: "https://angular.dev/tools/cli/setup-local"
});

// src/hooks/pre-tool-use.ts
function isPluginDisabled() {
  try {
    const settingsPath = getClaudeSettingsPath();
    if (!(0, import_fs4.existsSync)(settingsPath)) return false;
    const settings = JSON.parse((0, import_fs4.readFileSync)(settingsPath, "utf-8"));
    return settings?.enabledPlugins?.[`${process.env.PLUGIN_ID ?? "cc-boost"}`] === false;
  } catch {
    return false;
  }
}
function shouldSkipCommand(command, config) {
  const stripped = command.replace(/^(\w+=\S+\s+)*/, "").trim();
  return config.excludeCommands.some(
    (exc) => stripped === exc || stripped.startsWith(exc + " ")
  );
}
async function main() {
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (() => true);
  try {
    if (isPluginDisabled()) {
      process.stdout.write(JSON.stringify(passthrough()) + "\n");
      process.exit(EXIT_CODES.SUCCESS);
    }
    const raw = await readJsonFromStdin();
    if (!raw || raw.tool_name !== "Bash") {
      process.stdout.write(JSON.stringify(passthrough()) + "\n");
      process.exit(EXIT_CODES.SUCCESS);
    }
    const command = raw.tool_input?.command;
    if (!command || typeof command !== "string") {
      process.stdout.write(JSON.stringify(passthrough()) + "\n");
      process.exit(EXIT_CODES.SUCCESS);
    }
    const config = loadConfig(raw.cwd);
    if (config.disabled) {
      process.stdout.write(JSON.stringify(passthrough()) + "\n");
      process.exit(EXIT_CODES.SUCCESS);
    }
    for (const entry of registry.getAll()) {
      const result = detectInteractiveCommand(command, entry);
      if (result.matched && !result.configured) {
        logger.info("HOOK", `Intercepted interactive command: ${command.slice(0, 80)}`);
        const response2 = buildInteractiveBlockResponse(command, result.entry);
        process.stdout.write(JSON.stringify(response2) + "\n");
        process.exit(EXIT_CODES.SUCCESS);
      }
    }
    if (shouldSkipCommand(command, config)) {
      process.stdout.write(JSON.stringify(passthrough()) + "\n");
      process.exit(EXIT_CODES.SUCCESS);
    }
    const pluginRoot = resolvePluginRoot(__importMetaUrl);
    const filterScript = (0, import_path4.join)(pluginRoot, "scripts", "filter.cjs");
    if (!(0, import_fs4.existsSync)(filterScript)) {
      logger.warn("HOOK", `filter.cjs not found at ${filterScript}, passing through`);
      process.stdout.write(JSON.stringify(passthrough()) + "\n");
      process.exit(EXIT_CODES.SUCCESS);
    }
    const wrapped = wrapCommandWithFilter(command, filterScript, config);
    logger.debug("HOOK", `Wrapping: ${command.slice(0, 60)} \u2192 filter`);
    const response = allowWithWrappedCommand(wrapped);
    process.stdout.write(JSON.stringify(response) + "\n");
    process.exit(EXIT_CODES.SUCCESS);
  } catch (err) {
    try {
      process.stderr.write = origStderrWrite;
      logger.error("HOOK", `Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
    } catch {
    }
    process.stdout.write(JSON.stringify(passthrough()) + "\n");
    process.exit(EXIT_CODES.SUCCESS);
  }
}
main();
