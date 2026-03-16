import { describe, it, expect } from 'vitest';
import { cropStackTraces } from '../src/filter/stack-trace-cropper.js';

const MOCK_TRACE = `TypeError: Cannot read properties of undefined (reading 'map')
    at processItems (/app/src/utils.ts:42:18)
    at Object.<anonymous> (/app/node_modules/express/lib/router/index.js:284:7)
    at Function.process_params (/app/node_modules/express/lib/router/index.js:346:12)
    at next (/app/node_modules/express/lib/router/index.js:189:13)
    at Layer.handle (/app/node_modules/express/lib/router/layer.js:95:5)
    at /app/node_modules/body-parser/index.js:34:16
    at /app/node_modules/raw-body/index.js:224:16
    at IncomingMessage.emit (node:events:519:28)
    at endReadableNT (node:internal/streams/readable.js:1696:12)
    at process.processTicksAndExits (node:internal/process/task_queues.js:82:21)
    at runTest (/app/src/runner.ts:88:5)
    at main (/app/src/index.ts:15:3)`;

describe('cropStackTraces', () => {
  it('preserves user code frames', () => {
    const result = cropStackTraces(MOCK_TRACE);
    expect(result).toContain('at processItems (/app/src/utils.ts:42:18)');
    expect(result).toContain('at runTest (/app/src/runner.ts:88:5)');
    expect(result).toContain('at main (/app/src/index.ts:15:3)');
  });

  it('folds node_modules frames into summary', () => {
    const result = cropStackTraces(MOCK_TRACE);
    // Actual at-frames must be gone (matched as regex to check line-level)
    expect(result).not.toMatch(/^\s+at .+node_modules[\\/]/m);
    // Summary line must be present
    expect(result).toContain('internal frames hidden by cc-boost');
    expect(result).toContain('express');
    expect(result).toContain('body-parser');
  });

  it('folds node:internal frames', () => {
    const result = cropStackTraces(MOCK_TRACE);
    // Actual at-frames for node internals must be gone
    expect(result).not.toMatch(/^\s+at .+node:internal/m);
    expect(result).not.toMatch(/^\s+at .+node:events/m);
    // But the summary label "node:internals" is fine (it's in the folded summary line)
  });

  it('preserves error message line', () => {
    const result = cropStackTraces(MOCK_TRACE);
    expect(result).toContain("TypeError: Cannot read properties of undefined (reading 'map')");
  });

  it('reduces line count significantly', () => {
    const before = MOCK_TRACE.split('\n').length;
    const after = cropStackTraces(MOCK_TRACE).split('\n').length;
    expect(after).toBeLessThan(before);
    expect(after).toBeLessThanOrEqual(6); // 1 error + 1 user frame + 1 fold summary + 2 user frames
  });

  it('passes through text without stack traces unchanged', () => {
    const text = 'Build complete\nFiles: 42\nTime: 1.2s';
    expect(cropStackTraces(text)).toBe(text);
  });
});
