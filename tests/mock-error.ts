/**
 * mock-error.ts — Generates noisy output for demonstration/testing.
 *
 * Run:   npx ts-node tests/mock-error.ts
 * Then:  npx ts-node tests/mock-error.ts 2>&1 | node plugin/scripts/filter.cjs
 *
 * Shows the before/after effect of cc-boost filtering.
 */

// ANSI color helpers
const R = '\x1b[31m';  // red
const G = '\x1b[32m';  // green
const Y = '\x1b[33m';  // yellow
const B = '\x1b[34m';  // blue
const D = '\x1b[0m';   // reset

// 1. Simulate npm install progress bar (200 lines of \r noise)
console.log(`${G}> npm install${D}`);
for (let i = 1; i <= 50; i++) {
  const bar = '█'.repeat(i) + '░'.repeat(50 - i);
  process.stdout.write(`\r${Y}⠋${D} Installing packages: [${bar}] ${i * 2}%`);
}
process.stdout.write('\n');
for (let i = 0; i < 30; i++) {
  console.log(`${Y}npm warn${D} deprecated package@${i}.0.0: use newpackage instead`);
}
console.log(`${G}added 847 packages in 12.3s${D}`);
console.log('');

// 2. Simulate a stack trace with many node_modules frames
console.log(`\n${R}TypeError: Cannot read properties of undefined (reading 'map')${D}`);
console.log(`    at processItems (${B}/app/src/utils.ts:42:18${D})`);
// 15 node_modules frames
const nodeModulesFrames = [
  `    at Object.<anonymous> (/app/node_modules/express/lib/router/index.js:284:7)`,
  `    at Function.process_params (/app/node_modules/express/lib/router/index.js:346:12)`,
  `    at next (/app/node_modules/express/lib/router/index.js:189:13)`,
  `    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)`,
  `    at trim_prefix (/app/node_modules/express/lib/router/index.js:317:13)`,
  `    at /app/node_modules/express/lib/router/index.js:284:7`,
  `    at Function.process_params (/app/node_modules/express/lib/router/index.js:346:12)`,
  `    at next (/app/node_modules/express/lib/router/index.js:189:13)`,
  `    at /app/node_modules/body-parser/index.js:34:16`,
  `    at /app/node_modules/body-parser/lib/read.js:137:3`,
  `    at invokeCallback (/app/node_modules/raw-body/index.js:224:16)`,
  `    at done (/app/node_modules/raw-body/index.js:213:7)`,
  `    at IncomingMessage.onEnd (/app/node_modules/raw-body/index.js:273:7)`,
  `    at IncomingMessage.emit (node:events:519:28)`,
  `    at endReadableNT (node:internal/streams/readable.js:1696:12)`,
  `    at process.processTicksAndExits (node:internal/process/task_queues.js:82:21)`,
];
nodeModulesFrames.forEach(f => console.log(f));
console.log(`    at ${B}runTest (/app/src/runner.ts:88:5)${D}`);
console.log(`    at ${B}main (/app/src/index.ts:15:3)${D}`);

// 3. Simulate jest output with passing tests
console.log('\n');
for (let i = 0; i < 20; i++) {
  console.log(`${G}  ✓ should handle case ${i + 1} (${Math.floor(Math.random() * 50) + 5}ms)${D}`);
}
console.log(`\n${R}  ✕ should process items correctly${D}`);
console.log(`\n    ${R}● should process items correctly${D}`);
console.log(`\n      ${R}expect(received).toEqual(expected)${D}`);
console.log(`\n      Expected: [1, 2, 3]`);
console.log(`      Received: undefined`);

console.log(`\n${G}PASS${D}  src/utils.test.ts`);
console.log(`${R}FAIL${D}  src/runner.test.ts`);
console.log(`\nTests: ${R}1 failed${D}, ${G}20 passed${D}, 21 total`);
