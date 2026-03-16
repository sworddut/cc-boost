import { registry } from '../registry.js';

registry.register({
  name: 'angular-cli',
  displayName: 'Angular',
  patterns: [
    /npx\s+@angular\/cli\s+new/,
    /npx\s+@angular\/cli@\S+\s+new/,
    /ng\s+new\s/,
  ],
  answerFlags: [
    '--routing', '--no-routing',
    '--style',
    '--ssr', '--no-ssr',
    '--standalone', '--no-standalone',
    '--yes', '-y',
  ],
  questions: [
    {
      id: 'routing',
      label: '是否添加 Angular Router？',
      description: '推荐 Yes（多页面应用必须）',
      default: true,
      flagYes: '--routing',
      flagNo: '--no-routing',
    },
    {
      id: 'style',
      label: '选择样式文件格式',
      description: '默认 CSS',
      default: false,
      choices: [
        { value: 'css',  label: 'CSS',  flag: '--style css' },
        { value: 'scss', label: 'SCSS', flag: '--style scss' },
        { value: 'sass', label: 'Sass', flag: '--style sass' },
        { value: 'less', label: 'Less', flag: '--style less' },
      ],
    },
    {
      id: 'ssr',
      label: '是否启用 SSR（服务端渲染）？',
      description: '默认 No',
      default: false,
      flagYes: '--ssr',
      flagNo: '--no-ssr',
    },
    {
      id: 'standalone',
      label: '是否使用 Standalone Components（无 NgModule）？',
      description: '推荐 Yes（Angular 17+ 新方式）',
      default: true,
      flagYes: '--standalone',
      flagNo: '--no-standalone',
    },
  ],
  docsUrl: 'https://angular.dev/tools/cli/setup-local',
});
