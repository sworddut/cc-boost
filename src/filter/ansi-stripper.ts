// ANSI escape code regex — covers colors, cursor movement, etc.
// Claude Code does NOT strip these before passing to LLM (Issue #18728)
const ANSI_REGEX = /[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}
