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

// Banner/define used for any CJS bundle that calls resolvePluginRoot(import.meta.url)
const cjsImportMetaBanner = {
  banner: { js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;' },
  define: { 'import.meta.url': '__importMetaUrl' },
};

async function run() {
  // 1. PreToolUse hook — the script Claude Code calls before each Bash tool use
  await build({
    ...shared,
    ...cjsImportMetaBanner,
    entryPoints: ['src/hooks/pre-tool-use.ts'],
    outfile: join(outDir, 'pre-tool-use.js'),
    format: 'cjs',
  });

  // 2. Setup hook — installs plugin deps on session start
  await build({
    ...shared,
    ...cjsImportMetaBanner,
    entryPoints: ['src/hooks/smart-install.ts'],
    outfile: join(outDir, 'smart-install.js'),
    format: 'cjs',
  });

  // 3. Filter pipeline — runs as a shell pipe: cmd 2>&1 | node filter.cjs
  await build({
    ...shared,
    entryPoints: ['src/filter-main.ts'],
    outfile: join(outDir, 'filter.cjs'),
    format: 'cjs',
  });

  const sizes = await Promise.all(
    ['pre-tool-use.js', 'smart-install.js', 'filter.cjs'].map(async (f) => {
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
