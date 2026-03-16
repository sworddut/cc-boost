import type { FrameworkEntry, Question } from './registry.js';
import { blockWithReason } from '../hooks/hook-response.js';
import type { BlockResponse } from '../hooks/hook-response.js';

/**
 * Build the block response that tells Claude to ask the user for
 * scaffold configuration choices before re-running the command.
 */
export function buildInteractiveBlockResponse(
  originalCommand: string,
  entry: FrameworkEntry
): BlockResponse {
  const reason = buildBlockReason(originalCommand, entry);
  return blockWithReason(reason);
}

function buildBlockReason(originalCommand: string, entry: FrameworkEntry): string {
  const lines: string[] = [];

  lines.push(`[cc-boost] 检测到交互式脚手架命令，Claude 无法直接操作键盘选择界面。`);
  lines.push('');
  lines.push(`请向用户确认以下配置项，然后携带对应 flags 重新执行命令：`);
  lines.push('');
  lines.push(`原始命令: ${originalCommand}`);
  lines.push(`框架: ${entry.displayName} (${entry.name})`);
  if (entry.docsUrl) lines.push(`文档: ${entry.docsUrl}`);
  lines.push('');
  lines.push('━━━ 需要确认的配置项 ━━━');

  entry.questions.forEach((q, i) => {
    lines.push('');
    lines.push(`${i + 1}. ${q.label}`);
    if (q.description) lines.push(`   说明: ${q.description}`);

    if (q.choices) {
      lines.push(`   选项:`);
      q.choices.forEach(c => {
        lines.push(`     • ${c.label}  →  ${c.flag}`);
      });
    } else {
      const def = q.default ? 'Yes' : 'No';
      lines.push(`   默认: ${def}`);
      lines.push(`   Flag: Yes → ${q.flagYes}  |  No → ${q.flagNo}`);
    }
  });

  // Build default-values example command
  const defaultFlags = buildDefaultFlags(entry.questions);
  const baseCmd = originalCommand.trim();
  const exampleCmd = defaultFlags.length > 0
    ? `${baseCmd} ${defaultFlags.join(' ')}`
    : baseCmd;

  lines.push('');
  lines.push('━━━ 全部使用默认值的参考命令 ━━━');
  lines.push(exampleCmd);

  return lines.join('\n');
}

function buildDefaultFlags(questions: Question[]): string[] {
  const flags: string[] = [];
  for (const q of questions) {
    if (q.choices) {
      // For choice questions, skip the example (user must choose)
      continue;
    }
    if (q.default) {
      if (q.flagYes) flags.push(q.flagYes);
    } else {
      if (q.flagNo) flags.push(q.flagNo);
    }
  }
  return flags;
}
