import type { FrameworkEntry } from './registry.js';

/**
 * Detect if a command would trigger interactive prompts AND hasn't been
 * pre-configured with flags yet.
 *
 * Returns:
 * - { matched: true, configured: true }  → let it through (has flags)
 * - { matched: true, configured: false } → block and ask user
 * - { matched: false }                   → not an interactive command
 */
export type DetectionResult =
  | { matched: false }
  | { matched: true; configured: boolean; entry: FrameworkEntry };

export function detectInteractiveCommand(
  command: string,
  entry: FrameworkEntry
): DetectionResult {
  const isMatch = entry.patterns.some(p => p.test(command));
  if (!isMatch) return { matched: false };

  const isConfigured = entry.answerFlags.some(flag => command.includes(flag));
  return { matched: true, configured: isConfigured, entry };
}
