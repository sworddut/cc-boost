import { describe, it, expect, beforeAll } from 'vitest';
import { registry } from '../src/interactive/registry.js';
import { detectInteractiveCommand } from '../src/interactive/detector.js';
import { buildInteractiveBlockResponse } from '../src/interactive/handler.js';

// Load framework registrations
beforeAll(async () => {
  await import('../src/interactive/frameworks/next.js');
  await import('../src/interactive/frameworks/vite.js');
  await import('../src/interactive/frameworks/svelte.js');
  await import('../src/interactive/frameworks/remix.js');
  await import('../src/interactive/frameworks/angular.js');
});

describe('detectInteractiveCommand', () => {
  it('detects create-next-app without flags', () => {
    const entry = registry.match('npx create-next-app@latest my-app');
    expect(entry).not.toBeNull();
    const result = detectInteractiveCommand('npx create-next-app@latest my-app', entry!);
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.configured).toBe(false);
  });

  it('allows create-next-app with flags', () => {
    const entry = registry.match('npx create-next-app@latest my-app --typescript');
    expect(entry).not.toBeNull();
    const result = detectInteractiveCommand('npx create-next-app@latest my-app --typescript', entry!);
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.configured).toBe(true);
  });

  it('detects npm create vite', () => {
    const entry = registry.match('npm create vite@latest my-project');
    expect(entry).not.toBeNull();
    const result = detectInteractiveCommand('npm create vite@latest my-project', entry!);
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.configured).toBe(false);
  });

  it('allows vite with --template flag', () => {
    const cmd = 'npm create vite@latest my-project --template react-ts';
    const entry = registry.match(cmd);
    expect(entry).not.toBeNull();
    const result = detectInteractiveCommand(cmd, entry!);
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.configured).toBe(true);
  });

  it('returns not matched for regular commands', () => {
    const entry = registry.match('npm test');
    expect(entry).toBeNull();
  });
});

describe('buildInteractiveBlockResponse', () => {
  it('produces a block response with structured reason', () => {
    const entry = registry.match('npx create-next-app@latest my-app')!;
    const response = buildInteractiveBlockResponse('npx create-next-app@latest my-app', entry);
    expect(response.hookSpecificOutput.permissionDecision).toBe('block');
    expect(response.hookSpecificOutput.reason).toContain('[cc-boost]');
    expect(response.hookSpecificOutput.reason).toContain('create-next-app');
    expect(response.hookSpecificOutput.reason).toContain('--typescript');
    expect(response.hookSpecificOutput.reason).toContain('--tailwind');
  });

  it('includes default command example', () => {
    const entry = registry.match('npx create-next-app@latest my-app')!;
    const response = buildInteractiveBlockResponse('npx create-next-app@latest my-app', entry);
    expect(response.hookSpecificOutput.reason).toContain('全部使用默认值');
    expect(response.hookSpecificOutput.reason).toContain('npx create-next-app@latest my-app');
  });
});
