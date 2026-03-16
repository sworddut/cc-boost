/**
 * stdin reader for Claude Code hooks.
 *
 * CRITICAL: Claude Code does NOT close stdin after writing hook input.
 * Therefore stdin.on('end') NEVER fires — hooks would hang forever if we wait for it.
 *
 * Solution: JSON is self-delimiting. We attempt to parse after each data chunk.
 * Once we have valid complete JSON, we resolve immediately without waiting for EOF.
 *
 * Adapted from claude-mem's stdin-reader.ts (MIT, github.com/thedotmack/claude-mem)
 */

import { STDIN_SAFETY_TIMEOUT_MS, STDIN_PARSE_DELAY_MS } from '../shared/constants.js';

function isStdinAvailable(): boolean {
  try {
    const stdin = process.stdin;
    if (stdin.isTTY) return false; // Running interactively, not from a hook
    // Accessing .readable triggers lazy init — if it throws, stdin is broken
    void stdin.readable;
    return true;
  } catch {
    return false;
  }
}

function tryParseJson(input: string): { success: true; value: unknown } | { success: false } {
  const trimmed = input.trim();
  if (!trimmed) return { success: false };
  try {
    return { success: true, value: JSON.parse(trimmed) };
  } catch {
    return { success: false };
  }
}

export async function readJsonFromStdin(): Promise<unknown> {
  if (!isStdinAvailable()) return undefined;

  return new Promise((resolve, reject) => {
    let input = '';
    let resolved = false;
    let parseDelayId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      try {
        process.stdin.removeAllListeners('data');
        process.stdin.removeAllListeners('end');
        process.stdin.removeAllListeners('error');
      } catch { /* ignore */ }
    };

    const resolveWith = (value: unknown) => {
      if (resolved) return;
      resolved = true;
      if (parseDelayId) clearTimeout(parseDelayId);
      clearTimeout(safetyId);
      cleanup();
      resolve(value);
    };

    const rejectWith = (err: Error) => {
      if (resolved) return;
      resolved = true;
      if (parseDelayId) clearTimeout(parseDelayId);
      clearTimeout(safetyId);
      cleanup();
      reject(err);
    };

    const tryResolve = () => {
      const r = tryParseJson(input);
      if (r.success) { resolveWith(r.value); return true; }
      return false;
    };

    const safetyId = setTimeout(() => {
      if (!resolved) {
        if (!tryResolve()) {
          if (input.trim()) {
            rejectWith(new Error(`Incomplete JSON after ${STDIN_SAFETY_TIMEOUT_MS}ms`));
          } else {
            resolveWith(undefined);
          }
        }
      }
    }, STDIN_SAFETY_TIMEOUT_MS);

    try {
      process.stdin.on('data', (chunk) => {
        input += chunk;
        if (parseDelayId) { clearTimeout(parseDelayId); parseDelayId = null; }
        if (tryResolve()) return;
        parseDelayId = setTimeout(tryResolve, STDIN_PARSE_DELAY_MS);
      });

      process.stdin.on('end', () => {
        if (!resolved) tryResolve() || resolveWith(undefined);
      });

      process.stdin.on('error', () => {
        if (!resolved) resolveWith(undefined);
      });
    } catch {
      resolved = true;
      clearTimeout(safetyId);
      cleanup();
      resolve(undefined);
    }
  });
}
