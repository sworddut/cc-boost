/**
 * filter-main.ts — Entry point for the filter pipeline (runs as a pipe).
 *
 * Usage: some-command 2>&1 | node filter.cjs [--budget=N] [--cmd="original command"]
 *
 * Reads all of stdin, runs through FilterPipeline, writes to stdout.
 * This runs as a child process in a pipeline, not as a hook.
 */

import { loadConfig } from './config/loader.js';
import { runFilterPipeline } from './filter/pipeline.js';

function parseArgs(): { budget?: number; cmd?: string; cwd?: string } {
  const args: { budget?: number; cmd?: string; cwd?: string } = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--budget=')) args.budget = parseInt(arg.slice(9), 10);
    if (arg.startsWith('--cmd=')) args.cmd = arg.slice(6);
    if (arg.startsWith('--cwd=')) args.cwd = arg.slice(6);
  }
  return args;
}

async function readAllStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

async function main(): Promise<void> {
  const args = parseArgs();
  const config = loadConfig(args.cwd ?? process.cwd());

  if (args.budget) config.budget = args.budget;

  const rawText = await readAllStdin();
  const { filteredText } = runFilterPipeline(rawText, config, args.cmd);

  process.stdout.write(filteredText);
}

main().catch(() => {
  // On error, output nothing and let the pipeline continue cleanly
  process.exit(0);
});
