/**
 * build.mjs — cc-boost build script
 *
 * Bundles two self-contained Node.js scripts into plugin/scripts/:
 *
 *   pre-tool-use.js  — PreToolUse hook entry point (reads stdin, outputs JSON)
 *   filter.cjs       — Filter pipeline (reads stdin pipe, writes filtered stdout)
 *
 * Both are bundled with all dependencies inlined (including strip-ansi),
 * so the plugin requires NO npm install at runtime.
 */
import { build } from 'esbuild';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, 'plugin', 'scripts');

mkdirSync(outDir, { recursive: true });

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  // Bundle everything inline — output is fully self-contained
  packages: 'bundle',
};

async function run() {
  // 1. PreToolUse hook — the script Claude Code calls before each Bash tool use
  await build({
    ...shared,
    entryPoints: ['src/hooks/pre-tool-use.ts'],
    outfile: join(outDir, 'pre-tool-use.js'),
    format: 'cjs',
    // esbuild leaves import.meta.url as an empty object in CJS output.
    // Inject a banner that defines __importMetaUrl from CJS __filename,
    // then map import.meta.url to that identifier so resolvePluginRoot() works.
    banner: {
      js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;',
    },
    define: {
      'import.meta.url': '__importMetaUrl',
    },
  });

  // 2. Filter pipeline — runs as a shell pipe: cmd 2>&1 | node filter.cjs
  await build({
    ...shared,
    entryPoints: ['src/filter-main.ts'],
    outfile: join(outDir, 'filter.cjs'),
    format: 'cjs',
  });

  const sizes = await Promise.all(
    ['pre-tool-use.js', 'filter.cjs'].map(async (f) => {
      const { statSync } = await import('fs');
      const size = statSync(join(outDir, f)).size;
      return `  ${f}: ${(size / 1024).toFixed(1)}KB`;
    })
  );

  console.log('Build complete:');
  sizes.forEach(s => console.log(s));
}

run().catch(err => {
  console.error('Build failed:', err.message);
  process.exit(1);
});
