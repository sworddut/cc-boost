"use strict";

// src/config/loader.ts
var import_fs = require("fs");
var import_path2 = require("path");

// src/shared/paths.ts
var import_path = require("path");
var import_os = require("os");
function getCcBoostDataDir() {
  return (0, import_path.join)((0, import_os.homedir)(), ".cc-boost");
}
function getGlobalConfigPath() {
  return (0, import_path.join)(getCcBoostDataDir(), "config.json");
}

// src/shared/constants.ts
var DEFAULT_TOKEN_BUDGET = 2e3;
var CHARS_PER_TOKEN = 4;
var DEFAULT_CHAR_BUDGET = DEFAULT_TOKEN_BUDGET * CHARS_PER_TOKEN;

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
  if ((0, import_fs.existsSync)(globalPath)) {
    try {
      configs.push(JSON.parse((0, import_fs.readFileSync)(globalPath, "utf-8")));
    } catch {
    }
  }
  if (cwd) {
    const projectPath = (0, import_path2.join)(cwd, ".cc-boost.json");
    if ((0, import_fs.existsSync)(projectPath)) {
      try {
        configs.push(JSON.parse((0, import_fs.readFileSync)(projectPath, "utf-8")));
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

// src/filter/ansi-stripper.ts
var ANSI_REGEX = /[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
function stripAnsi(text) {
  return text.replace(ANSI_REGEX, "");
}

// src/filter/progress-reducer.ts
var SPINNER_ONLY = /^[\s⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|/\-\\▁▂▃▄▅▆▇█▇▆▅▄▃▂▁]+$/;
function reduceProgress(text) {
  const lines = text.split("\n");
  const result = [];
  for (const line of lines) {
    if (line.includes("\r")) {
      const frames = line.split("\r");
      const last = frames.filter((f) => f.trim()).pop() ?? "";
      if (last.trim()) result.push(last);
    } else {
      result.push(line);
    }
  }
  return result.filter((line) => !SPINNER_ONLY.test(line.trim()) || line.trim() === "").join("\n");
}

// src/filter/stack-trace-cropper.ts
var NODE_MODULES_FRAME = /node_modules[\\/]/;
var NODE_INTERNAL_FRAME = /\bnode:[a-z]/;
var STACK_FRAME_LINE = /^\s+at /;
function extractPackageName(line) {
  const m = line.match(/node_modules[/\\]((?:@[^/\\]+[/\\])?[^/\\]+)/);
  return m ? m[1] : "unknown";
}
function isInternalFrame(line) {
  return STACK_FRAME_LINE.test(line) && (NODE_MODULES_FRAME.test(line) || NODE_INTERNAL_FRAME.test(line));
}
function buildFoldSummary(frames) {
  const counts = /* @__PURE__ */ new Map();
  for (const frame of frames) {
    if (NODE_INTERNAL_FRAME.test(frame)) {
      counts.set("node:internals", (counts.get("node:internals") ?? 0) + 1);
    } else {
      const pkg = extractPackageName(frame);
      counts.set(pkg, (counts.get(pkg) ?? 0) + 1);
    }
  }
  const parts = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([pkg, n]) => `${pkg} \xD7${n}`).join(", ");
  return `    ... [${frames.length} internal frames hidden by cc-boost: ${parts}]`;
}
function cropStackTraces(text) {
  const lines = text.split("\n");
  const output = [];
  let internalBuffer = [];
  const flushBuffer = () => {
    if (internalBuffer.length > 0) {
      output.push(buildFoldSummary(internalBuffer));
      internalBuffer = [];
    }
  };
  for (const line of lines) {
    if (isInternalFrame(line)) {
      internalBuffer.push(line);
    } else {
      flushBuffer();
      output.push(line);
    }
  }
  flushBuffer();
  return output.join("\n");
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
function applyLineFilters(text, rule) {
  if (!rule.filterLines?.length && !rule.maxLines && !rule.keepOnlyFailing) {
    return text;
  }
  let lines = text.split("\n");
  if (rule.filterLines?.length) {
    const patterns = rule.filterLines.map((p) => p.toLowerCase());
    lines = lines.filter((line) => {
      const lower = line.toLowerCase();
      return !patterns.some((p) => lower.includes(p));
    });
  }
  if (rule.keepOnlyFailing) {
    lines = filterTestOutput(lines);
  }
  if (rule.maxLines && lines.length > rule.maxLines) {
    const removed = lines.length - rule.maxLines;
    lines = lines.slice(0, rule.maxLines);
    lines.push(`... [${removed} more lines hidden by cc-boost]`);
  }
  return lines.join("\n");
}
function filterTestOutput(lines) {
  const result = [];
  let inFailBlock = false;
  let summaryStarted = false;
  for (const line of lines) {
    if (/^(Tests|Test Suites|Snapshots|Time|Ran all)/.test(line)) {
      summaryStarted = true;
    }
    if (summaryStarted) {
      result.push(line);
      continue;
    }
    if (/^\s*FAIL\s/.test(line) || /^●/.test(line)) {
      inFailBlock = true;
    }
    if (/^\s*PASS\s/.test(line)) {
      inFailBlock = false;
      continue;
    }
    if (inFailBlock || /^(FAIL|RUNS|ERROR)/.test(line)) {
      result.push(line);
    }
  }
  return result.length > 0 ? result : lines;
}

// src/filter/token-budget.ts
var ERROR_LINE = /^(Error:|TypeError:|SyntaxError:|ReferenceError:|RangeError:|FAIL |FAILED|ERROR |error TS)/i;
var USER_FRAME = /^\s+at .+(?<!node_modules.+)\.(ts|js|tsx|jsx):\d+/;
function applyTokenBudget(text, budgetTokens) {
  const maxChars = budgetTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  const lines = text.split("\n");
  const joined = lines.join("\n");
  if (joined.length <= maxChars) return joined;
  const noticeChars = 80;
  const available = maxChars - noticeChars;
  const errorLines = [];
  const userFrames = [];
  const other = [];
  lines.forEach((line, i) => {
    if (ERROR_LINE.test(line)) errorLines.push([i, line]);
    else if (USER_FRAME.test(line)) userFrames.push([i, line]);
    else other.push([i, line]);
  });
  const kept = /* @__PURE__ */ new Set();
  let usedChars = 0;
  const addLines = (candidates) => {
    for (const [i, line] of candidates) {
      if (usedChars + line.length + 1 > available) break;
      kept.add(i);
      usedChars += line.length + 1;
    }
  };
  addLines(errorLines);
  addLines(userFrames);
  const remainingLines = other.filter(([i]) => !kept.has(i));
  addLines([...remainingLines].reverse());
  addLines(remainingLines);
  const resultLines = [];
  let lastKept = -1;
  let hiddenCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (kept.has(i)) {
      if (hiddenCount > 0) {
        resultLines.push(`... [cc-boost: ${hiddenCount} lines hidden, budget=${budgetTokens} tokens]`);
        hiddenCount = 0;
      }
      resultLines.push(lines[i]);
      lastKept = i;
    } else {
      hiddenCount++;
    }
  }
  if (hiddenCount > 0) {
    resultLines.push(`... [cc-boost: ${hiddenCount} lines hidden, budget=${budgetTokens} tokens]`);
  }
  return resultLines.join("\n");
}

// src/filter/pipeline.ts
function runFilterPipeline(rawText, config, command) {
  const originalLength = rawText.length;
  let text = rawText;
  text = stripAnsi(text);
  text = reduceProgress(text);
  if (config.stackTrace.foldNodeModules || config.stackTrace.foldNodeInternal) {
    text = cropStackTraces(text);
  }
  if (command) {
    const rule = getCommandRule(command, config);
    if (rule) text = applyLineFilters(text, rule);
  }
  for (const cf of config.customFilters) {
    try {
      const re = new RegExp(cf.pattern, "gm");
      if (cf.action === "drop") {
        text = text.replace(re, "");
      }
    } catch {
    }
  }
  text = applyTokenBudget(text, config.budget);
  const filteredLength = text.length;
  const reductionPercent = originalLength > 0 ? Math.round((1 - filteredLength / originalLength) * 100) : 0;
  return { filteredText: text, originalLength, filteredLength, reductionPercent };
}

// src/filter-main.ts
function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--budget=")) args.budget = parseInt(arg.slice(9), 10);
    if (arg.startsWith("--cmd=")) args.cmd = arg.slice(6);
    if (arg.startsWith("--cwd=")) args.cwd = arg.slice(6);
  }
  return args;
}
async function readAllStdin() {
  return new Promise((resolve2) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve2(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", () => resolve2(Buffer.concat(chunks).toString("utf-8")));
  });
}
async function main() {
  const args = parseArgs();
  const config = loadConfig(args.cwd ?? process.cwd());
  if (args.budget) config.budget = args.budget;
  const rawText = await readAllStdin();
  const { filteredText } = runFilterPipeline(rawText, config, args.cmd);
  process.stdout.write(filteredText);
}
main().catch(() => {
  process.exit(0);
});
