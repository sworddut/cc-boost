import { CHARS_PER_TOKEN } from '../shared/constants.js';

/**
 * Token budget enforcement.
 *
 * When output exceeds the budget, we keep:
 * 1. Error lines (highest priority)
 * 2. User code stack frames (non-node_modules)
 * 3. Last N lines (most recent = most relevant)
 * 4. First N lines (context/header)
 *
 * Truncation marker is inserted between kept sections.
 */

const ERROR_LINE = /^(Error:|TypeError:|SyntaxError:|ReferenceError:|RangeError:|FAIL |FAILED|ERROR |error TS)/i;
const USER_FRAME = /^\s+at .+(?<!node_modules.+)\.(ts|js|tsx|jsx):\d+/;

export function applyTokenBudget(text: string, budgetTokens: number): string {
  const maxChars = budgetTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;

  const lines = text.split('\n');

  // Already within budget after basic filtering?
  const joined = lines.join('\n');
  if (joined.length <= maxChars) return joined;

  // Reserve chars for the truncation notice
  const noticeChars = 80;
  const available = maxChars - noticeChars;

  // Partition lines by priority
  const errorLines: Array<[number, string]> = [];
  const userFrames: Array<[number, string]> = [];
  const other: Array<[number, string]> = [];

  lines.forEach((line, i) => {
    if (ERROR_LINE.test(line)) errorLines.push([i, line]);
    else if (USER_FRAME.test(line)) userFrames.push([i, line]);
    else other.push([i, line]);
  });

  // Fill budget: errors first, then user frames, then tail, then head
  const kept = new Set<number>();
  let usedChars = 0;

  const addLines = (candidates: Array<[number, string]>) => {
    for (const [i, line] of candidates) {
      if (usedChars + line.length + 1 > available) break;
      kept.add(i);
      usedChars += line.length + 1;
    }
  };

  addLines(errorLines);
  addLines(userFrames);

  // Fill with tail lines
  const remainingLines = other.filter(([i]) => !kept.has(i));
  addLines([...remainingLines].reverse()); // tail first
  // Then head
  addLines(remainingLines);

  // Reconstruct in original order
  const resultLines: string[] = [];
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

  return resultLines.join('\n');
}
