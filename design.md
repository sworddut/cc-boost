# cc-boost 设计文档

> 开源的、可配置的 Claude Code 输出过滤插件
> 参考项目：claude-mem (github.com/thedotmack/claude-mem)

---

## 一、背景与痛点

当 LLM Agent 在终端执行命令时，面对两类核心问题：

**噪音问题（输出端）**：
1. **Token 严重浪费**：ANSI 颜色控制符、进度条刷新（`\r`）、无用警告白白消耗 Token
2. **"中间迷失"导致修复失败**：Stack Trace 动辄几十行，90% 是 `node_modules` 内部流转，真正的报错原因被淹没
3. **内存泄漏**：Claude Code 把所有 bash 输出存入内存直到会话结束（Issue #11155，Anthropic 标记为 NOT_PLANNED），大型测试套件可导致 90GB+ 内存占用

**交互阻塞问题（输入端）**：

4. **脚手架命令无法执行**：`npx create-next-app`、`npm create vite@latest` 等现代框架脚手架使用 TTY 键盘交互（方向键选择、回车确认）。Claude Code 执行这类命令时：
   - 命令挂起等待键盘输入，Claude 无法响应
   - 通过管道过滤时 TTY 检测失败，CLI 崩溃或进入非预期的非交互模式
   - 用户需要手动中断并重新运行，严重打断工作流

---

## 二、关键架构约束（调研结论）

### PostToolUse 无法修改输出 ⚠️

**PostToolUse hook 是只读的，Claude 看到的输出无法被修改。**

- Issue #4544（2025年7月）：关闭为重复
- Issue #18594（2026年1月）：关闭为 `NOT_PLANNED`，2026年2月锁定

### 唯一可行路径：PreToolUse 命令包装

```
Claude 准备执行: "npm test"
        ↓ PreToolUse hook 拦截
修改为: "npm test 2>&1 | cc-boost filter"
        ↓
Claude 看到的输出: 已过滤的干净结果
```

PreToolUse 通过返回 `updatedInput` 替换原始命令，在命令执行前完成包装。

---

## 三、现有方案调研

### RTK（rtk-ai/rtk）— 最相关竞品

- **语言**：Rust（单二进制，零依赖，<10ms 开销）
- **机制**：PreToolUse 命令包装，支持 70+ 命令
- **效果**：社区验证 60–90% token 节省，有用户报告两周节省 10M token（89%）
- **致命缺陷**：**闭源**，不可配置，不可扩展

### claude-warden（johnzfitch/claude-warden）

- 规则粗暴（按大小截断而非内容感知），安全导向而非 token 优化

### 现有方案与 cc-boost 对比

| 项目 | 开源 | 可配置 | Node.js | 智能 Stack Trace | npm 发布 | 插件格式 |
|------|------|--------|---------|-----------------|---------|---------|
| RTK | ❌ | ❌ | ❌ | 基础 | ❌ | ❌ |
| claude-warden | ✅ | 有限 | ❌ | ❌ | ❌ | ❌ |
| **cc-boost** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 四、从 claude-mem 学到的关键工程经验

claude-mem 是一个工程质量非常高的 Claude Code 插件（v10.5.5，AGPL-3.0），我们直接借鉴以下设计：

### 4.1 Plugin 分发格式（必须采用）

```
cc-boost/
├── .claude-plugin/
│   ├── plugin.json          ← 插件元数据
│   └── marketplace.json     ← marketplace 注册
└── plugin/
    ├── hooks/
    │   └── hooks.json       ← hook 配置（随插件分发）
    ├── scripts/
    │   ├── smart-install.js  ← 安装脚本（Node.js，SessionStart 触发）
    │   ├── node-runner.js    ← 类似 bun-runner.js 的启动包装
    │   └── filter.cjs        ← 编译后的过滤器主体
    └── package.json
```

**关键**：`hooks.json` 随插件分发，不需要用户手动修改 `~/.claude/settings.json`。

### 4.2 CLAUDE_PLUGIN_ROOT 环境变量

Claude Code 为 hook 脚本设置 `CLAUDE_PLUGIN_ROOT`，指向插件目录。**但有两个陷阱**：

```javascript
// claude-mem 的 bun-runner.js 发现的 bug (#24529):
// Stop hooks（以及 Linux 上所有 hooks）不会收到 CLAUDE_PLUGIN_ROOT
// 必须自行从脚本位置推导
const RESOLVED_PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT
  || resolve(dirname(fileURLToPath(import.meta.url)), '..');
```

cc-boost 的路径解析顺序（参考 claude-mem）：
1. `CLAUDE_PLUGIN_ROOT` 环境变量（由 Claude Code 设置）
2. 从脚本自身位置推导（`dirname(this_file)/../`）
3. XDG 路径：`~/.config/claude/plugins/marketplaces/...`
4. 传统路径：`~/.claude/plugins/marketplaces/...`

### 4.3 stdin 读取的陷阱（必须处理）

**Claude Code 不会关闭 stdin。** 因此 `stdin.on('end')` 永远不会触发，hook 会永久挂起。

正确做法（来自 claude-mem 的 `stdin-reader.ts`）：
```typescript
// JSON 是自分隔格式，收到数据后立即尝试解析
// 一旦 JSON 完整，立即 resolve，无需等待 EOF
process.stdin.on('data', (chunk) => {
  input += chunk;
  const result = tryParseJson(input);
  if (result.success) resolve(result.value); // ← 立即返回
});
```

另外，**Bun 在 Linux 上会因 Claude Code 的 stdin pipe 崩溃**（EINVAL from fstat, Issue #646）。claude-mem 的解法是用 Node.js 的 `bun-runner.js` 先缓冲 stdin，再传给 Bun。我们直接用 Node.js 即可绕过此问题。

### 4.4 stderr 必须保持干净

```typescript
// claude-mem hook-command.ts 的做法：
// Claude Code 会把 stderr 当作错误 UI 显示给用户（Issue #1181）
// 所有诊断信息必须写日志文件，绝对不能输出到 stderr
process.stderr.write = (() => true) as typeof process.stderr.write; // 在 hook 内部静默 stderr
```

所有日志写入 `~/.cc-boost/logs/`，stderr 完全静默。

### 4.5 Hook 退出码语义

| 退出码 | 语义 | 场景 |
|--------|------|------|
| `0` | 成功 / 优雅降级 | 正常运行；或非关键错误，不阻塞用户 |
| `1` | 非阻塞错误 | stderr 显示给用户，工具继续执行 |
| `2` | 阻塞错误 | stderr 传给 Claude 处理（谨慎使用） |

对于 cc-boost：过滤失败时直接 exit 0 并让原始命令透传，绝不阻塞用户。

### 4.6 suppressOutput 字段

Hook 响应中必须加 `suppressOutput: true`，否则 hook 的 stdout 会显示在 Claude Code UI 中：

```json
{ "continue": true, "suppressOutput": true }
```

### 4.7 安装标记文件

避免每次 SessionStart 都重新安装依赖：

```javascript
// .install-version 文件存储版本信息
const marker = JSON.parse(readFileSync(MARKER));
if (pkg.version === marker.version) return; // 跳过安装
```

### 4.8 插件禁用检查

hook 入口第一步检查插件是否被禁用：

```javascript
const settings = JSON.parse(readFileSync('~/.claude/settings.json'));
if (settings?.enabledPlugins?.['cc-boost@author'] === false) process.exit(0);
```

---

## 五、产品定位

> **开源的、可配置的、Node.js 原生的 RTK，以 Claude Code 插件格式分发**

- 面向使用 Claude Code 的开发者
- 安装方式：`claude plugin install` 或手动克隆
- 开源 + 可扩展，支持自定义过滤规则（RTK 最大短板）
- 以 Stack Trace 智能折叠为核心差异化特性

---

## 六、系统架构

### 整体流程

```
┌─────────────────────────────────────────────────────┐
│                   Claude Code                        │
│  准备执行 Bash 命令: "npm test"                       │
└──────────────────────┬──────────────────────────────┘
                       │ PreToolUse event (stdin JSON)
                       ▼
┌─────────────────────────────────────────────────────┐
│         plugin/scripts/pre-tool-use-hook.js          │
│                                                      │
│  1. 读取 stdin（JSON 完整即返回，不等 EOF）            │
│  2. 解析 tool_input.command                          │
│  3. 查找匹配的命令规则                                │
│  4. 构造包装命令                                      │
│  5. stdout 输出 JSON（含 updatedInput）               │
│  6. 退出，不阻塞                                      │
└──────────────────────┬──────────────────────────────┘
                       │ updatedInput.command
                       ▼
     "npm test 2>&1 | node filter.cjs --budget=2000"
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              FilterPipeline (filter.cjs)             │
│                                                      │
│  stdin: 命令的原始输出流（管道输入）                   │
│  ① AnsiStripper      剥离 ANSI 控制符               │
│  ② ProgressReducer   折叠 \r 进度条刷新行            │
│  ③ StackTraceCropper 折叠 node_modules 帧（核心）    │
│  ④ CommandRules      命令专属规则（npm/jest/tsc…）   │
│  ⑤ TokenBudget       超限自适应截断                  │
│  stdout: 过滤后的干净输出                             │
└──────────────────────┬──────────────────────────────┘
                       │ 干净输出
                       ▼
                  Claude 看到结果
```

### PreToolUse Hook I/O 协议

**输入（stdin）**：
```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" },
  "session_id": "abc123",
  "cwd": "/project"
}
```

**输出（stdout）**：
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "command": "npm test 2>&1 | node /path/to/filter.cjs --budget=2000"
    }
  }
}
```

---

## 七、核心功能设计

### 7.1 AnsiStripper — ANSI 控制符剥离

使用 `strip-ansi` 包剥离所有 ANSI 颜色/格式控制符。

> Claude Code 不会自动剥离 ANSI 控制符（Issue #18728），这些非打印字符原样传入 LLM 消耗 token。

### 7.2 ProgressReducer — 进度条折叠

- 过滤 `\r` 覆写行（进度条刷新机制）
- 相同前缀行仅保留最后一条
- 效果：`npm install` 的 300 行进度刷新 → 1 行完成摘要

### 7.3 StackTraceCropper — 智能堆栈折叠（核心差异化）

**规则**：
- **保留**：所有非 `node_modules`、非 `node:internal/` 的业务代码帧（全部保留）
- **折叠**：连续的 `node_modules`/`node:internal/` 帧合并为一行
- **始终保留**：Error 类型行、Error Message 行

**示例**：

过滤前（22 行）：
```
TypeError: Cannot read properties of undefined (reading 'map')
    at processItems (/app/src/utils.ts:42:18)          ← 用户代码 ✅
    at Object.<anonymous> (/app/node_modules/express/lib/router/index.js:284:7)
    at Function.process_params (/app/node_modules/express/lib/router/index.js:346:12)
    at next (/app/node_modules/express/lib/router/index.js:189:13)
    at Layer.handle (/app/node_modules/express/lib/router/layer.js:95:5)
    at trim_prefix (/app/node_modules/express/lib/router/index.js:317:13)
    at /app/node_modules/express/lib/router/index.js:284:7
    at Function.process_params (/app/node_modules/express/lib/router/index.js:346:12)
    at next (/app/node_modules/express/lib/router/index.js:189:13)
    at /app/node_modules/body-parser/index.js:34:16
    at /app/node_modules/body-parser/lib/read.js:137:3
    at invokeCallback (/app/node_modules/raw-body/index.js:224:16)
    at done (/app/node_modules/raw-body/index.js:213:7)
    at IncomingMessage.onEnd (/app/node_modules/raw-body/index.js:273:7)
    at IncomingMessage.emit (node:events:519:28)        ← node internal
    at endReadableNT (node:internal/streams/readable.js:1696:12)
    at process.processTicksAndExits (node:internal/process/task_queues.js:82:21)
    at runTest (/app/src/runner.ts:88:5)                ← 用户代码 ✅
    at main (/app/src/index.ts:15:3)                    ← 用户代码 ✅
```

过滤后（6 行）：
```
TypeError: Cannot read properties of undefined (reading 'map')
    at processItems (/app/src/utils.ts:42:18)
    ... [14 internal frames hidden by cc-boost: express ×10, body-parser ×2, raw-body ×2]
    at runTest (/app/src/runner.ts:88:5)
    at main (/app/src/index.ts:15:3)
```

### 7.4 CommandRules — 命令专属规则

内置规则（可通过配置文件覆盖）：

| 命令 | 规则 |
|------|------|
| `npm install` / `pnpm install` | 追加 `--no-fund --no-audit`；过滤 `npm warn` 行 |
| `npm test` / `jest` / `vitest` | 仅保留 FAIL 块和 Summary；过滤 PASS 行 |
| `tsc` / `tsc --build` | 仅保留 `error TS` 行 |
| `eslint` | 过滤 warning（可配置保留） |
| `git log` | 限制最多 20 行 |
| `docker build` | 仅保留 Step 行和 ERROR |

### 7.5 TokenBudget — Token 预算截断

- 默认上限 2000 token（≈ 8000 字符）
- 超限时优先保留：错误信息 > 用户代码帧 > 末尾 N 行 > 开头 N 行
- 截断处插入：`...[cc-boost: X lines hidden, budget=2000 tokens]...`

---

### 7.6 InteractiveCommandHandler — 脚手架键盘交互拦截（第二个核心功能）

#### 问题本质

`create-next-app`、`create vite`、`create-remix` 等工具使用 `@inquirer/prompts`、`clack`、`ink` 等库渲染 TTY 交互界面。这类界面：

- 需要真实 TTY（`process.stdin.isTTY === true`）才能正常运行
- 通过管道时会崩溃或挂起
- Claude Code 无法模拟键盘输入

**根本解法**：在命令执行前拦截，让 Claude 通过正常对话向用户提问，再用 CLI flags 重新执行（完全绕过交互界面）。

#### 完整执行流程

```
┌─────────────────────────────────────────────────────────┐
│  第一次：Claude 执行 "npx create-next-app@latest my-app" │
└────────────────────┬────────────────────────────────────┘
                     │ PreToolUse stdin
                     ▼
┌─────────────────────────────────────────────────────────┐
│  InteractiveCommandHandler                               │
│  1. 匹配命令 → create-next-app ✓                        │
│  2. 检测 flags → 无配置 flags → 需要询问                 │
│  3. 返回 permissionDecision: "block"                     │
│     reason: 结构化问题清单（见下方）                      │
└────────────────────┬────────────────────────────────────┘
                     │ Claude 收到 block + reason
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Claude 向用户发出"类 tool"的结构化提问                   │
│                                                          │
│  "在运行 create-next-app 之前，我需要确认一些配置项：     │
│   1. 是否使用 TypeScript？(推荐 Yes)                     │
│   2. 是否使用 ESLint？(推荐 Yes)                         │
│   3. 是否使用 Tailwind CSS？                             │
│   4. 是否使用 src/ 目录？                                │
│   5. 是否使用 App Router？(推荐 Yes)                     │
│   6. 是否自定义默认 import alias (@/*)？(推荐 No)"       │
└────────────────────┬────────────────────────────────────┘
                     │ 用户回答："TypeScript Yes, Tailwind Yes,
                     │           其余全部默认"
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Claude 重新执行（带 flags）：                            │
│  "npx create-next-app@latest my-app \                    │
│     --typescript --eslint --tailwind                     │
│     --src-dir --app --no-import-alias"                   │
└────────────────────┬────────────────────────────────────┘
                     │ PreToolUse stdin（第二次）
                     ▼
┌─────────────────────────────────────────────────────────┐
│  InteractiveCommandHandler                               │
│  检测 flags → --typescript 存在 → 已配置 → 放行          │
│  → 走正常 FilterPipeline（过滤安装输出噪音）              │
└─────────────────────────────────────────────────────────┘
```

#### Block Response 格式（Claude 收到的 reason）

```
[cc-boost] 检测到交互式脚手架命令，Claude 无法直接操作键盘选择界面。

请向用户确认以下配置项，然后携带对应 flags 重新执行命令：

原始命令: npx create-next-app@latest my-app
框架: Next.js (create-next-app)

━━━ 需要确认的配置项 ━━━

1. TypeScript
   描述: 是否使用 TypeScript？
   默认: Yes
   Flag: Yes → --typescript | No → --no-typescript

2. ESLint
   描述: 是否使用 ESLint？
   默认: Yes
   Flag: Yes → --eslint | No → --no-eslint

3. Tailwind CSS
   描述: 是否使用 Tailwind CSS？
   默认: No
   Flag: Yes → --tailwind | No → --no-tailwind

4. src/ 目录
   描述: 是否使用 src/ 目录结构？
   默认: No
   Flag: Yes → --src-dir | No → --no-src-dir

5. App Router
   描述: 是否使用 App Router？（推荐，否则使用 Pages Router）
   默认: Yes
   Flag: Yes → --app | No → --no-app

6. Import Alias
   描述: 是否自定义默认 import alias (@/*)？
   默认: No
   Flag: Yes → --import-alias "@/*" | No → --no-import-alias

━━━ 全部默认的重新执行命令参考 ━━━
npx create-next-app@latest my-app --typescript --eslint --no-tailwind --no-src-dir --app --no-import-alias
```

#### 已配置检测逻辑（第二次放行）

```typescript
// 检测命令是否已包含配置 flags，有任意一个即视为"已配置"
function isAlreadyConfigured(command: string, entry: FrameworkEntry): boolean {
  return entry.answerFlags.some(flag => command.includes(flag));
}

// create-next-app 的 answerFlags:
// ['--typescript', '--no-typescript', '--eslint', '--no-eslint',
//  '--tailwind', '--no-tailwind', '--app', '--no-app', '--yes', '-y']
```

#### 框架注册表（FrameworkRegistry）

```typescript
interface Question {
  id: string;
  label: string;           // 显示给用户的问题
  description: string;     // 补充说明
  default: boolean;
  flagYes: string;
  flagNo: string;
}

interface FrameworkEntry {
  name: string;
  patterns: RegExp[];      // 匹配命令的正则
  answerFlags: string[];   // 任意一个存在即视为已配置，直接放行
  questions: Question[];
  docsUrl?: string;
}
```

**初版注册表（v0.1 支持）**：

| 框架 | 触发命令 | 问题数 |
|------|---------|-------|
| Next.js | `npx create-next-app` / `npm create next-app` | 6 |
| Vite | `npm create vite` / `pnpm create vite` / `yarn create vite` | 2（框架选择 + variant） |
| Remix | `npx create-remix` | 3（模板、TypeScript、是否初始化 git） |
| SvelteKit | `npm create svelte@latest` | 5（TypeScript、ESLint、Prettier、Playwright、Vitest） |
| Angular | `npx @angular/cli new` / `ng new` | 4（路由、CSS 预处理器、SSR、测试） |

**Vite 特殊处理**（framework 是字符串参数而非 boolean flag）：

```
Vite 问题:
1. 框架选择: vanilla / vue / react / preact / lit / svelte / solid / qwik
   → --template vanilla/vue/react/...
2. 语言变体: JavaScript / TypeScript
   → --template react 或 --template react-ts
```

#### 配置文件扩展

用户可在 `.cc-boost.json` 中添加自定义交互命令：

```json
{
  "interactiveCommands": [
    {
      "name": "my-company-cli",
      "patterns": ["npx @mycompany/create-app"],
      "answerFlags": ["--team", "--no-team"],
      "questions": [
        {
          "id": "team",
          "label": "是否关联到团队空间？",
          "default": true,
          "flagYes": "--team",
          "flagNo": "--no-team"
        }
      ]
    }
  ]
}
```

#### 与 FilterPipeline 的关系

两个功能在 PreToolUse 中串行检测，优先级明确：

```
PreToolUse 入口
  │
  ├─ [1] InteractiveCommandHandler.detect(command)
  │       ↓ 匹配到且未配置
  │       → return block response（不走 FilterPipeline）
  │
  └─ [2] FilterPipeline.wrap(command)
          ↓ 普通命令或已配置的脚手架命令
          → return updatedInput with filter pipe
```

---

## 八、插件文件结构

```
cc-boost/
├── .claude-plugin/
│   ├── plugin.json           ← 插件元数据（name, version, author）
│   └── marketplace.json      ← marketplace 分发配置
├── plugin/
│   ├── hooks/
│   │   └── hooks.json        ← Hook 配置（Claude Code 读取）
│   ├── scripts/
│   │   ├── smart-install.js  ← Node.js 安装脚本（SessionStart 触发）
│   │   ├── pre-tool-use.js   ← PreToolUse hook 入口（Node.js）
│   │   └── filter.cjs        ← 编译后的 FilterPipeline（管道过滤器）
│   └── package.json          ← 运行时依赖（strip-ansi 等）
└── src/                      ← TypeScript 源码
    ├── hooks/
    │   ├── stdin-reader.ts   ← JSON 完整检测读取（借鉴 claude-mem）
    │   ├── pre-tool-use.ts   ← Hook 入口逻辑
    │   └── hook-response.ts  ← 标准响应格式
    ├── filter/
    │   ├── pipeline.ts           ← FilterPipeline 组装
    │   ├── ansi-stripper.ts
    │   ├── progress-reducer.ts
    │   ├── stack-trace-cropper.ts
    │   ├── command-rules.ts
    │   └── token-budget.ts
    ├── interactive/
    │   ├── registry.ts           ← FrameworkRegistry 注册表
    │   ├── handler.ts            ← block response 生成
    │   ├── detector.ts           ← isAlreadyConfigured() 放行判断
    │   └── frameworks/
    │       ├── next.ts           ← create-next-app（6 个问题）
    │       ├── vite.ts           ← create vite（框架 + variant）
    │       ├── svelte.ts         ← create svelte@latest
    │       ├── remix.ts          ← create-remix
    │       └── angular.ts        ← ng new / @angular/cli new
    ├── config/
    │   └── loader.ts             ← 配置文件加载（~/.cc-boost/config.json）
    └── shared/
        ├── paths.ts              ← CLAUDE_PLUGIN_ROOT 解析
        └── constants.ts          ← 退出码、超时等常量
```

### hooks.json

```json
{
  "description": "cc-boost output filter hooks",
  "hooks": {
    "Setup": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "_R=\"${CLAUDE_PLUGIN_ROOT}\"; [ -z \"$_R\" ] && _R=\"$HOME/.claude/plugins/marketplaces/author/plugin\"; node \"$_R/scripts/smart-install.js\"",
          "timeout": 300
        }]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "_R=\"${CLAUDE_PLUGIN_ROOT}\"; [ -z \"$_R\" ] && _R=\"$HOME/.claude/plugins/marketplaces/author/plugin\"; node \"$_R/scripts/pre-tool-use.js\"",
          "timeout": 10
        }]
      }
    ]
  }
}
```

---

## 九、配置文件设计

`~/.cc-boost/config.json`（全局）或 `.cc-boost.json`（项目级，优先）：

```json
{
  "budget": 2000,
  "rules": {
    "npm install": {
      "appendArgs": ["--no-fund", "--no-audit"],
      "filterLines": ["npm warn", "npm notice"]
    },
    "jest": {
      "keepOnlyFailing": true
    },
    "eslint": {
      "filterSeverity": ["warning"]
    }
  },
  "stackTrace": {
    "foldNodeModules": true,
    "foldNodeInternal": true,
    "keepUserFrames": "all"
  },
  "customFilters": [
    {
      "name": "my-company-noise",
      "pattern": "\\[METRICS\\].*",
      "action": "drop"
    }
  ],
  "excludeCommands": ["git status", "ls", "pwd"],
  "disabled": false
}
```

---

## 十、MVP 实现计划（v0.1）

### 阶段一：基础骨架（第 1 天）

- [ ] TypeScript 项目初始化，目录结构搭建
- [ ] `paths.ts`：CLAUDE_PLUGIN_ROOT 解析（含 Linux Stop hook 陷阱处理）
- [ ] `stdin-reader.ts`：JSON 完整检测（不等 EOF，借鉴 claude-mem 方案）
- [ ] `pre-tool-use.ts`：读取 stdin → 解析 command → 返回 updatedInput
- [ ] `hooks.json` + `plugin.json` + `marketplace.json`

### 阶段二：核心过滤器（第 2 天）

- [ ] `ansi-stripper.ts`：基于 `strip-ansi`
- [ ] `progress-reducer.ts`：`\r` 行折叠
- [ ] `stack-trace-cropper.ts`：node_modules 帧折叠（**核心**）
- [ ] `token-budget.ts`：字符数预算截断
- [ ] `pipeline.ts`：组装以上过滤器

### 阶段三：InteractiveCommandHandler（第 3 天）

- [ ] `interactive/registry.ts`：FrameworkEntry 类型定义 + 注册表接口
- [ ] `interactive/frameworks/next.ts`：Next.js create-next-app 规则（6 个问题）
- [ ] `interactive/frameworks/vite.ts`：Vite 规则（框架 + variant）
- [ ] `interactive/frameworks/svelte.ts`：SvelteKit 规则
- [ ] `interactive/frameworks/remix.ts`：Remix 规则
- [ ] `interactive/frameworks/angular.ts`：Angular CLI 规则
- [ ] `interactive/handler.ts`：检测逻辑 + block response 生成
- [ ] `interactive/detector.ts`：`isAlreadyConfigured()` 放行判断
- [ ] PreToolUse 入口串联两条路径（block 优先于 filter）

### 阶段四：命令规则 + 配置（第 4 天）

- [ ] `command-rules.ts`：npm / jest / tsc 内置规则
- [ ] `config/loader.ts`：配置文件加载（项目级 > 全局 > 默认），支持自定义 `interactiveCommands`
- [ ] `smart-install.js`：依赖安装 + 版本标记（参考 claude-mem）

### 阶段五：验证与演示（第 5 天）

- [ ] `mock-error.ts`：生成带颜色噪音 + 20 行 node_modules 堆栈的 mock 输出
- [ ] 过滤前后 token 数对比报告
- [ ] E2E 演示：`npx create-next-app` → hook 拦截 → Claude 提问 → 带 flags 重新执行
- [ ] 集成测试：真实 `npm test` 场景

---

## 十一、技术选型

| 依赖 | 用途 | 说明 |
|------|------|------|
| `strip-ansi` v7 | ANSI 剥离 | 10,000+ 依赖，ESM |
| TypeScript | 开发语言 | 编译为 CJS（`.cjs`）确保 Node.js 兼容性 |
| `vitest` | 测试框架 | 快速，ESM 原生 |

**不需要 `node-pty`**：PreToolUse 命令包装在命令执行前介入，`filter.cjs` 作为管道运行，完全规避 TTY 检测问题。

**不需要持久化 Worker**：与 claude-mem 不同，cc-boost 的过滤是无状态的同步管道操作，hook 轻量快速（<10ms），无需后台服务。

---

## 十二、已知限制与风险

| 限制 | 说明 |
|------|------|
| 命令 transcript 可见性 | Claude 记录中显示包装后的命令（含 `\| cc-boost filter`），与 RTK 相同，无法规避 |
| 二进制输出 | 检测到非文本流时跳过过滤，直接透传 |
| Token 估算误差 | 预算基于字符数（1 token ≈ 4 字符），非精确计算 |
| Linux Bun stdin crash | 选择 Node.js 运行时绕过，无需 bun-runner.js 包装 |
| CLAUDE_PLUGIN_ROOT 缺失 | Stop hooks 和 Linux 环境下不传此变量，必须从脚本位置自行推导 |
| 交互式命令 flag 变化 | 框架更新可能改变 CLI flags（如 create-next-app v15 vs v14），注册表需随版本维护 |
| 未注册的交互命令 | 非内置框架的交互式 CLI 不会被识别，仍会挂起。未来可通过检测 `package.json` 中的 `@inquirer/prompts` / `clack` 依赖做通用检测 |

---

## 附录：claude-mem 关键工程经验汇总

| 问题 | claude-mem 的解法 | cc-boost 采用 |
|------|------------------|--------------|
| stdin 不关闭导致 hook 挂起 | JSON 完整检测，收到有效 JSON 立即返回 | ✅ 采用 |
| Bun 在 Linux 崩溃 | Node.js bun-runner.js 缓冲 stdin | ✅ 直接用 Node.js |
| stderr 显示为错误 UI | hook 内部静默 stderr，日志写文件 | ✅ 采用 |
| 每次都重装依赖 | `.install-version` 版本标记文件 | ✅ 采用 |
| Stop hook 无 CLAUDE_PLUGIN_ROOT | 从脚本自身路径推导 plugin root | ✅ 采用 |
| hook 输出显示在 UI | `suppressOutput: true` | ✅ 采用 |
| 插件禁用检查 | 读 settings.json enabledPlugins | ✅ 采用 |
| 平台路径兼容性 | Windows/macOS/Linux 分支 | ✅ 采用 |
