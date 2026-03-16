import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getGlobalConfigPath } from '../shared/paths.js';
import { DEFAULT_TOKEN_BUDGET } from '../shared/constants.js';
import type { FrameworkEntry } from '../interactive/registry.js';

export interface CommandRule {
  appendArgs?: string[];
  filterLines?: string[];
  keepOnlyFailing?: boolean;
  filterSeverity?: string[];
  maxLines?: number;
}

export interface CustomFilter {
  name: string;
  pattern: string;
  action: 'drop' | 'keep';
}

export interface StackTraceConfig {
  foldNodeModules: boolean;
  foldNodeInternal: boolean;
  keepUserFrames: 'all' | number;
}

export interface CcBoostConfig {
  budget: number;
  rules: Record<string, CommandRule>;
  stackTrace: StackTraceConfig;
  customFilters: CustomFilter[];
  excludeCommands: string[];
  disabled: boolean;
  interactiveCommands: PartialFrameworkEntry[];
}

// Subset of FrameworkEntry that users can define in config
export interface PartialFrameworkEntry {
  name: string;
  patterns: string[];    // string patterns, compiled to RegExp
  answerFlags: string[];
  questions: Array<{
    id: string;
    label: string;
    description: string;
    default: boolean;
    flagYes: string;
    flagNo: string;
  }>;
}

const DEFAULTS: CcBoostConfig = {
  budget: DEFAULT_TOKEN_BUDGET,
  rules: {
    'npm install': { appendArgs: ['--no-fund', '--no-audit'], filterLines: ['npm warn', 'npm notice'] },
    'npm i':       { appendArgs: ['--no-fund', '--no-audit'], filterLines: ['npm warn', 'npm notice'] },
    'pnpm install':{ filterLines: ['Progress:'] },
    'jest':        { keepOnlyFailing: true },
    'vitest':      { keepOnlyFailing: true },
    'tsc':         { filterLines: [] },   // handled specially
    'eslint':      { filterSeverity: ['warning'] },
    'git log':     { maxLines: 20 },
    'docker build':{ filterLines: [] },  // handled specially
  },
  stackTrace: {
    foldNodeModules: true,
    foldNodeInternal: true,
    keepUserFrames: 'all',
  },
  customFilters: [],
  excludeCommands: ['ls', 'pwd', 'echo', 'cat', 'which', 'type'],
  disabled: false,
  interactiveCommands: [],
};

export function loadConfig(cwd?: string): CcBoostConfig {
  const configs: Partial<CcBoostConfig>[] = [];

  // 1. Global config
  const globalPath = getGlobalConfigPath();
  if (existsSync(globalPath)) {
    try {
      configs.push(JSON.parse(readFileSync(globalPath, 'utf-8')));
    } catch { /* ignore malformed config */ }
  }

  // 2. Project config (higher priority)
  if (cwd) {
    const projectPath = join(cwd, '.cc-boost.json');
    if (existsSync(projectPath)) {
      try {
        configs.push(JSON.parse(readFileSync(projectPath, 'utf-8')));
      } catch { /* ignore */ }
    }
  }

  // Merge: project overrides global overrides defaults
  return configs.reduce<CcBoostConfig>(
    (acc, partial) => deepMerge(acc, partial as Partial<CcBoostConfig>),
    { ...DEFAULTS }
  );
}

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const val = override[key];
    if (val !== undefined) {
      if (typeof val === 'object' && !Array.isArray(val) && val !== null) {
        result[key] = deepMerge(base[key] as object, val as object) as T[typeof key];
      } else {
        result[key] = val as T[typeof key];
      }
    }
  }
  return result;
}
