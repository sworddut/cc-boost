# cc-boost

> 开源的 Claude Code 输出过滤插件，通过 PreToolUse Hook 拦截 Bash 命令，减少 Token 消耗、解决脚手架交互阻塞问题。

---

## 功能

### 1. 输出过滤（Output Filter）

将 Bash 命令包装为管道，在输出到达 Claude 前进行清洗：

- **ANSI 剥离**：去除颜色控制符，这些非打印字符原样进 LLM 白白消耗 Token
- **进度条折叠**：`\r` 刷新行合并为一条，`npm install` 的 300 行进度 → 1 行结果
- **Stack Trace 折叠**：连续的 `node_modules` / `node:internal` 帧合并，只保留业务代码帧
- **命令专属规则**：`npm install` 自动加 `--no-fund --no-audit`，`jest`/`vitest` 只保留失败块等
- **Token 预算截断**：超过 2000 token 上限时智能裁剪，优先保留错误信息

**Stack Trace 示例：**

```
# 过滤前（22 行）
TypeError: Cannot read properties of undefined (reading 'map')
    at processItems (/app/src/utils.ts:42:18)
    at Object.<anonymous> (/app/node_modules/express/lib/router/index.js:284:7)
    at Function.process_params (/app/node_modules/express/lib/router/index.js:346:12)
    ... 14 行 node_modules 内部帧 ...
    at runTest (/app/src/runner.ts:88:5)
    at main (/app/src/index.ts:15:3)

# 过滤后（5 行）
TypeError: Cannot read properties of undefined (reading 'map')
    at processItems (/app/src/utils.ts:42:18)
    ... [14 internal frames hidden by cc-boost: express ×10, body-parser ×2, raw-body ×2]
    at runTest (/app/src/runner.ts:88:5)
    at main (/app/src/index.ts:15:3)
```

### 2. 脚手架命令拦截（Interactive Command Interception）

`create-next-app`、`create vite` 等工具依赖 TTY 键盘交互界面，Claude Code 无法操作，命令会挂起。

cc-boost 在命令执行前拦截，让 Claude 向用户确认配置项，再用 CLI flags 重新执行，完全绕过交互界面。

**支持的框架：**

| 框架 | 触发命令 |
|------|---------|
| Next.js | `npx create-next-app` |
| Vite | `npm/pnpm/yarn create vite` |
| SvelteKit | `npm/pnpm create svelte` |
| Remix | `npx create-remix` |
| Angular | `npx @angular/cli new` / `ng new` |

---

## 安装

需要 Node.js >= 18。

```bash
git clone https://github.com/sworddut/cc-boost
cd cc-boost
npm install
npm run install:plugin
```

`install:plugin` 会自动完成：
1. 编译 TypeScript 源码
2. 复制插件文件到 `~/.claude/plugins/marketplaces/cc-boost/plugin/`
3. 在 `~/.claude/settings.json` 注册 hooks
4. 安装运行时依赖

重启 Claude Code 后生效。

---

## 配置

### 全局配置

`~/.cc-boost/config.json`：

```json
{
  "budget": 2000,
  "disabled": false,
  "rules": {
    "npm install": {
      "appendArgs": ["--no-fund", "--no-audit"],
      "filterLines": ["npm warn", "npm notice"]
    },
    "jest": { "keepOnlyFailing": true },
    "eslint": { "filterSeverity": ["warning"] },
    "git log": { "maxLines": 20 }
  },
  "stackTrace": {
    "foldNodeModules": true,
    "foldNodeInternal": true,
    "keepUserFrames": "all"
  },
  "excludeCommands": ["ls", "pwd", "echo", "cat"]
}
```

### 项目级配置

在项目根目录创建 `.cc-boost.json`，会覆盖全局配置中的对应字段。

### 禁用插件

在 `~/.claude/settings.json` 中添加：

```json
{
  "enabledPlugins": {
    "cc-boost": false
  }
}
```

---

## 工作原理

cc-boost 注册两个 Claude Code Hooks：

**Setup Hook** — 会话启动时检查依赖，有更新时自动安装。

**PreToolUse Hook (Bash)** — 每次 Bash 工具调用前：

```
Claude 准备执行 Bash 命令
        ↓
PreToolUse Hook 接收命令
        ↓
[1] 是否为交互式脚手架命令？
    是，且无配置 flags → 返回 deny，附带结构化问题清单
                         Claude 向用户确认后携带 flags 重新执行
        ↓
[2] 包装为过滤管道
    "npm install react" → "(npm install react --no-fund --no-audit) 2>&1 | node filter.cjs"
        ↓
Claude 看到过滤后的干净输出
```

---

## 开发

```bash
npm run build        # 编译
npm run test         # 运行测试
npm run typecheck    # 类型检查
```

日志文件：`~/.cc-boost/cc-boost.log`

---

## 项目结构

```
src/
├── hooks/
│   ├── pre-tool-use.ts     # PreToolUse hook 入口
│   ├── smart-install.ts    # Setup hook（依赖安装）
│   ├── hook-response.ts    # Hook 响应格式
│   └── stdin-reader.ts     # JSON 完整检测读取（不等 EOF）
├── filter/
│   ├── pipeline.ts         # 过滤管道组装
│   ├── ansi-stripper.ts
│   ├── progress-reducer.ts
│   ├── stack-trace-cropper.ts
│   ├── command-rules.ts
│   └── token-budget.ts
├── interactive/
│   ├── registry.ts         # 框架注册表
│   ├── detector.ts         # 已配置检测（放行判断）
│   ├── handler.ts          # Block response 生成
│   └── frameworks/         # next / vite / svelte / remix / angular
├── config/
│   └── loader.ts           # 配置文件加载
└── shared/
    ├── paths.ts            # 路径解析
    ├── logger.ts
    └── constants.ts
```

---

## License

MIT
