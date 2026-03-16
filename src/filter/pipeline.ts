import { stripAnsi } from './ansi-stripper.js';
import { reduceProgress } from './progress-reducer.js';
import { cropStackTraces } from './stack-trace-cropper.js';
import { applyLineFilters, applyArgInjection, getCommandRule } from './command-rules.js';
import { applyTokenBudget } from './token-budget.js';
import type { CcBoostConfig } from '../config/loader.js';

export interface PipelineResult {
  filteredText: string;
  originalLength: number;
  filteredLength: number;
  reductionPercent: number;
}

export function runFilterPipeline(rawText: string, config: CcBoostConfig, command?: string): PipelineResult {
  const originalLength = rawText.length;

  let text = rawText;

  // Step 1: Strip ANSI escape codes
  text = stripAnsi(text);

  // Step 2: Fold progress bar noise
  text = reduceProgress(text);

  // Step 3: Fold stack trace internals
  if (config.stackTrace.foldNodeModules || config.stackTrace.foldNodeInternal) {
    text = cropStackTraces(text);
  }

  // Step 4: Apply command-specific line filters
  if (command) {
    const rule = getCommandRule(command, config);
    if (rule) text = applyLineFilters(text, rule);
  }

  // Step 5: Apply custom filters
  for (const cf of config.customFilters) {
    try {
      const re = new RegExp(cf.pattern, 'gm');
      if (cf.action === 'drop') {
        text = text.replace(re, '');
      }
    } catch { /* ignore invalid regex */ }
  }

  // Step 6: Token budget enforcement
  text = applyTokenBudget(text, config.budget);

  const filteredLength = text.length;
  const reductionPercent = originalLength > 0
    ? Math.round((1 - filteredLength / originalLength) * 100)
    : 0;

  return { filteredText: text, originalLength, filteredLength, reductionPercent };
}

/**
 * Wrap a command to pipe its output through the filter.
 * Returns the modified command string.
 */
export function wrapCommandWithFilter(
  command: string,
  filterScriptPath: string,
  config: CcBoostConfig
): string {
  // Apply arg injection for known commands
  let cmd = command;
  const rule = getCommandRule(command, config);
  if (rule) cmd = applyArgInjection(cmd, rule);

  // Wrap: redirect stderr to stdout and pipe through filter
  return `(${cmd}) 2>&1 | node "${filterScriptPath}" --budget=${config.budget}`;
}
