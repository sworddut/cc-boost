import type { CcBoostConfig, CommandRule } from '../config/loader.js';

/**
 * Apply command-specific filtering rules.
 * Returns { modifiedCommand, postFilter } where:
 *   - modifiedCommand: command with appended args (e.g., --no-fund)
 *   - postFilter: function to apply to command output after it runs
 */

export function getCommandRule(
  command: string,
  config: CcBoostConfig
): CommandRule | null {
  for (const [pattern, rule] of Object.entries(config.rules)) {
    // Match if the command starts with the pattern (ignoring leading env vars)
    const strippedCmd = command.replace(/^(\w+=\S+\s+)*/, '').trim();
    if (strippedCmd === pattern || strippedCmd.startsWith(pattern + ' ') || strippedCmd.startsWith(pattern + '\t')) {
      return rule;
    }
  }
  return null;
}

export function applyArgInjection(command: string, rule: CommandRule): string {
  if (!rule.appendArgs?.length) return command;

  // Don't add args that are already present
  const toAdd = rule.appendArgs.filter(arg => !command.includes(arg));
  if (!toAdd.length) return command;

  return command + ' ' + toAdd.join(' ');
}

export function applyLineFilters(text: string, rule: CommandRule): string {
  if (!rule.filterLines?.length && !rule.maxLines && !rule.keepOnlyFailing) {
    return text;
  }

  let lines = text.split('\n');

  // Filter lines containing noise patterns
  if (rule.filterLines?.length) {
    const patterns = rule.filterLines.map(p => p.toLowerCase());
    lines = lines.filter(line => {
      const lower = line.toLowerCase();
      return !patterns.some(p => lower.includes(p));
    });
  }

  // Jest/Vitest: keep only failing test blocks + summary
  if (rule.keepOnlyFailing) {
    lines = filterTestOutput(lines);
  }

  // Limit max lines (e.g., git log)
  if (rule.maxLines && lines.length > rule.maxLines) {
    const removed = lines.length - rule.maxLines;
    lines = lines.slice(0, rule.maxLines);
    lines.push(`... [${removed} more lines hidden by cc-boost]`);
  }

  return lines.join('\n');
}

function filterTestOutput(lines: string[]): string[] {
  const result: string[] = [];
  let inFailBlock = false;
  let summaryStarted = false;

  for (const line of lines) {
    // Jest/Vitest summary lines
    if (/^(Tests|Test Suites|Snapshots|Time|Ran all)/.test(line)) {
      summaryStarted = true;
    }
    if (summaryStarted) {
      result.push(line);
      continue;
    }

    // FAIL block start
    if (/^\s*FAIL\s/.test(line) || /^●/.test(line)) {
      inFailBlock = true;
    }
    // PASS line: skip
    if (/^\s*PASS\s/.test(line)) {
      inFailBlock = false;
      continue;
    }

    if (inFailBlock || /^(FAIL|RUNS|ERROR)/.test(line)) {
      result.push(line);
    }
  }

  return result.length > 0 ? result : lines; // fallback: return all if nothing matched
}
