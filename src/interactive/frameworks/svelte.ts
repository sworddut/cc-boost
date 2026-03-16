import { registry } from '../registry.js';

registry.register({
  name: 'create-svelte',
  displayName: 'SvelteKit',
  patterns: [
    /npm\s+create\s+svelte/,
    /pnpm\s+create\s+svelte/,
    /yarn\s+create\s+svelte/,
    /npx\s+create-svelte/,
  ],
  answerFlags: [
    '--types', '--no-types',
    '--eslint', '--no-eslint',
    '--prettier', '--no-prettier',
    '--playwright', '--no-playwright',
    '--vitest', '--no-vitest',
    '--yes', '-y',
  ],
  questions: [
    {
      id: 'typescript',
      label: '是否添加类型检查（TypeScript / JSDoc）？',
      description: '推荐 TypeScript',
      default: true,
      flagYes: '--types ts',
      flagNo: '--no-types',
    },
    {
      id: 'eslint',
      label: '是否添加 ESLint？',
      description: '代码质量检查，推荐 Yes',
      default: true,
      flagYes: '--eslint',
      flagNo: '--no-eslint',
    },
    {
      id: 'prettier',
      label: '是否添加 Prettier？',
      description: '代码格式化，推荐 Yes',
      default: true,
      flagYes: '--prettier',
      flagNo: '--no-prettier',
    },
    {
      id: 'playwright',
      label: '是否添加 Playwright（E2E 测试）？',
      description: '默认 No',
      default: false,
      flagYes: '--playwright',
      flagNo: '--no-playwright',
    },
    {
      id: 'vitest',
      label: '是否添加 Vitest（单元测试）？',
      description: '默认 No',
      default: false,
      flagYes: '--vitest',
      flagNo: '--no-vitest',
    },
  ],
  docsUrl: 'https://kit.svelte.dev/docs/creating-a-project',
});
