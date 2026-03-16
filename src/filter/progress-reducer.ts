/**
 * Reduces progress bar noise.
 *
 * Many CLI tools use \r (carriage return without newline) to overwrite
 * the current line, creating animated progress bars. When captured
 * in a pipe, these become hundreds of near-duplicate lines.
 *
 * Strategy:
 * 1. Split on \r — each \r-delimited segment is a "frame"
 * 2. Within each \n-line, keep only the last \r frame (the final state)
 * 3. Remove lines that are pure spinner/progress characters
 */

const SPINNER_ONLY = /^[\s⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|/\-\\▁▂▃▄▅▆▇█▇▆▅▄▃▂▁]+$/;

export function reduceProgress(text: string): string {
  // Split into logical lines (on \n)
  const lines = text.split('\n');

  const result: string[] = [];
  for (const line of lines) {
    // If line contains \r, split and keep last non-empty frame
    if (line.includes('\r')) {
      const frames = line.split('\r');
      const last = frames.filter(f => f.trim()).pop() ?? '';
      if (last.trim()) result.push(last);
    } else {
      result.push(line);
    }
  }

  // Remove pure spinner lines
  return result
    .filter(line => !SPINNER_ONLY.test(line.trim()) || line.trim() === '')
    .join('\n');
}
