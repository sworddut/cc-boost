import { registry } from '../registry.js';

registry.register({
  name: 'create-remix',
  displayName: 'Remix',
  patterns: [
    /npx\s+create-remix/,
    /npm\s+create\s+remix/,
    /pnpm\s+create\s+remix/,
    /yarn\s+create\s+remix/,
  ],
  answerFlags: [
    '--template',
    '--typescript', '--no-typescript',
    '--install', '--no-install',
    '--git-init', '--no-git-init',
    '--yes', '-y',
  ],
  questions: [
    {
      id: 'typescript',
      label: '是否使用 TypeScript？',
      description: '推荐 Yes',
      default: true,
      flagYes: '--typescript',
      flagNo: '--no-typescript',
    },
    {
      id: 'install',
      label: '是否立即安装依赖？',
      description: '推荐 Yes',
      default: true,
      flagYes: '--install',
      flagNo: '--no-install',
    },
    {
      id: 'git',
      label: '是否初始化 Git 仓库？',
      description: '默认 No',
      default: false,
      flagYes: '--git-init',
      flagNo: '--no-git-init',
    },
  ],
  docsUrl: 'https://remix.run/docs/en/main/other-api/create-remix',
});
