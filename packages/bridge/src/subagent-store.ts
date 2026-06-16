import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * 子代理（Claude Code 原生 subagent）存取：定义文件放在 `~/.claude/agents/`，claude 会自动发现，
 * 主会话用内置的 Task 工具按 description 自动委派给它——在**独立上下文 + 独立工具**里做重活
 * （文档/日志总结、消息分类等），不污染主会话上下文。一个画布「子代理节点」= 一份
 * `~/.claude/agents/oblivionis-<nodeId>.md`。无引擎侧注入：claude 原生发现 + 委派。
 */
const AGENTS_DIR = () => join(homedir(), ".claude", "agents");

const STARTER_SUBAGENT = `---
name: my-subagent
description: 描述这个子代理擅长什么、什么时候该用它——claude 据此自动委派。例：把长文档/聊天记录/日志总结成要点；当需要总结大段内容、或先分类再处理时使用。（请改成你的；并把 name 改成简短英文 kebab-case 且全局唯一）
tools: Read, Grep, Glob
---

你是一个专门做「（在这里写职责，例如：文档/日志总结、消息分类）」的子代理，在独立上下文里干活，不占用主会话的上下文。

# 怎么做
- 只做被委派的这一件事，做完直接给结论。
- 输出用要点、简洁。

# 注意
- 上面的 \`name\` 必须是简短英文(kebab-case)、全局唯一；\`description\` 要写清"何时该用我"，主会话才会在合适时机委派给你。
- \`tools\` 按需增减（如要写文件可加 Write/Edit；只读分析保持 Read/Grep/Glob 即可）。
`;

export function subagentPath(nodeId: string): string {
  const safe = nodeId.replace(/[^a-zA-Z0-9-]/g, "_");
  return join(AGENTS_DIR(), `oblivionis-${safe}.md`);
}

/** 确保子代理定义存在（无则播种 starter，绝不覆盖）。返回 { path, created } */
export function ensureSubagent(nodeId: string): { path: string; created: boolean } {
  const p = subagentPath(nodeId);
  if (existsSync(p)) return { path: p, created: false };
  try {
    mkdirSync(AGENTS_DIR(), { recursive: true });
    writeFileSync(p, STARTER_SUBAGENT, "utf8");
    return { path: p, created: true };
  } catch {
    return { path: p, created: false };
  }
}
