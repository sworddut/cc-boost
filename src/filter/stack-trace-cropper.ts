/**
 * Smart stack trace folding.
 *
 * Problem: Node.js stack traces often contain 10-20 frames from node_modules
 * and node internals. These are irrelevant for debugging and waste LLM tokens.
 *
 * Strategy:
 * - KEEP: All user-code frames (not in node_modules or node:internal)
 * - KEEP: Error type and message lines (always)
 * - FOLD: Consecutive node_modules / node:internal frames → single summary line
 *
 * Example fold output:
 *   ... [14 internal frames hidden by cc-boost: express ×10, body-parser ×2, raw-body ×2]
 */

// Patterns that identify "internal" (foldable) stack frames.
// Node.js stack frames come in two forms:
//   named:     at FnName (/path/to/node_modules/pkg/file.js:line:col)
//   anonymous: at /path/to/node_modules/pkg/file.js:line:col   ← no parens!
// Both must be matched, so we do NOT require a leading '('.
const NODE_MODULES_FRAME = /node_modules[\\/]/;
const NODE_INTERNAL_FRAME = /\bnode:[a-z]/;
const STACK_FRAME_LINE = /^\s+at /;

// Extract package name from a node_modules frame
function extractPackageName(line: string): string {
  const m = line.match(/node_modules[/\\]((?:@[^/\\]+[/\\])?[^/\\]+)/);
  return m ? m[1] : 'unknown';
}

function isInternalFrame(line: string): boolean {
  return STACK_FRAME_LINE.test(line) && (
    NODE_MODULES_FRAME.test(line) || NODE_INTERNAL_FRAME.test(line)
  );
}

function buildFoldSummary(frames: string[]): string {
  // Count frames per package
  const counts = new Map<string, number>();
  for (const frame of frames) {
    if (NODE_INTERNAL_FRAME.test(frame)) {
      counts.set('node:internals', (counts.get('node:internals') ?? 0) + 1);
    } else {
      const pkg = extractPackageName(frame);
      counts.set(pkg, (counts.get(pkg) ?? 0) + 1);
    }
  }

  const parts = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1]) // sort by count descending
    .map(([pkg, n]) => `${pkg} ×${n}`)
    .join(', ');

  return `    ... [${frames.length} internal frames hidden by cc-boost: ${parts}]`;
}

export function cropStackTraces(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];
  let internalBuffer: string[] = [];

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

  return output.join('\n');
}
