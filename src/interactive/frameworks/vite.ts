import { registry } from '../registry.js';

registry.register({
  name: 'create-vite',
  displayName: 'Vite',
  patterns: [
    /npm\s+create\s+vite/,
    /pnpm\s+create\s+vite/,
    /yarn\s+create\s+vite/,
    /npx\s+create-vite/,
    /bun\s+create\s+vite/,
  ],
  answerFlags: [
    '--template',
    '-t',
  ],
  questions: [
    {
      id: 'framework',
      label: '选择框架',
      description: '选择项目使用的框架',
      default: false,
      choices: [
        { value: 'vanilla',       label: 'Vanilla（无框架）',    flag: '--template vanilla' },
        { value: 'vanilla-ts',    label: 'Vanilla + TypeScript', flag: '--template vanilla-ts' },
        { value: 'vue',           label: 'Vue',                  flag: '--template vue' },
        { value: 'vue-ts',        label: 'Vue + TypeScript',     flag: '--template vue-ts' },
        { value: 'react',         label: 'React',                flag: '--template react' },
        { value: 'react-ts',      label: 'React + TypeScript',   flag: '--template react-ts' },
        { value: 'react-swc',     label: 'React + SWC',          flag: '--template react-swc' },
        { value: 'react-swc-ts',  label: 'React + SWC + TypeScript', flag: '--template react-swc-ts' },
        { value: 'preact',        label: 'Preact',               flag: '--template preact' },
        { value: 'preact-ts',     label: 'Preact + TypeScript',  flag: '--template preact-ts' },
        { value: 'lit',           label: 'Lit',                  flag: '--template lit' },
        { value: 'lit-ts',        label: 'Lit + TypeScript',     flag: '--template lit-ts' },
        { value: 'svelte',        label: 'Svelte',               flag: '--template svelte' },
        { value: 'svelte-ts',     label: 'Svelte + TypeScript',  flag: '--template svelte-ts' },
        { value: 'solid',         label: 'Solid',                flag: '--template solid' },
        { value: 'solid-ts',      label: 'Solid + TypeScript',   flag: '--template solid-ts' },
        { value: 'qwik',          label: 'Qwik',                 flag: '--template qwik' },
        { value: 'qwik-ts',       label: 'Qwik + TypeScript',    flag: '--template qwik-ts' },
      ],
    },
  ],
  docsUrl: 'https://vitejs.dev/guide/',
});
