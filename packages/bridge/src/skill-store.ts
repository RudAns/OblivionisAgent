import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { OblivionisConfig } from "@oblivionis/shared";

/**
 * 技能(SKILL.md)存取——和人格(SOUL.md)互补：人格管"怎么说话"，技能管"怎么做事"
 * （话术 / 输出格式 / 检查清单 / 操作规程）。每个技能节点一份
 * `~/.oblivionis/skills/<nodeId>.md`，连到会话的「人格/技能口」即注入该会话的飞书回复。
 * 一个会话可连多个技能节点（按连线全部拼接注入）。纯文件驱动，可用任何编辑器改。
 */

const SKILLS_DIR = () => join(homedir(), ".oblivionis", "skills");

const STARTER_SKILL = `# 技能（操作性指令 / 话术 / 输出格式）

把这个会话在某类任务上要遵守的"做法"写在这里——和人格(SOUL.md)互补：人格管说话风格，技能管怎么做事。

## 示例：周报格式
- 回复分三段：① 本周进展 ② 风险/阻塞 ③ 下周计划
- 每段不超过 5 条，用「-」列点

（按需整段替换成你的话术 / 输出格式 / 检查清单。）
`;

export function skillPath(nodeId: string): string {
  const safe = nodeId.replace(/[^a-zA-Z0-9-]/g, "_");
  return join(SKILLS_DIR(), `${safe}.md`);
}

/** 读取技能内容；不存在/为空返回 undefined */
export function readSkill(nodeId: string): string | undefined {
  try {
    const p = skillPath(nodeId);
    if (!existsSync(p)) return undefined;
    const text = readFileSync(p, "utf8").trim();
    if (!text) return undefined;
    return text.length > 20_000 ? text.slice(0, 20_000) : text;
  } catch {
    return undefined;
  }
}

/** 解析连到某会话节点「人格/技能口」(targetHandle=fork) 的所有技能节点内容，拼接返回 */
export function resolveSessionSkills(
  config: Pick<OblivionisConfig, "graph">,
  sessionNodeId: string,
): string | undefined {
  const { nodes, edges } = config.graph;
  const parts: string[] = [];
  for (const e of edges) {
    if (e.target !== sessionNodeId) continue;
    if ((e.targetHandle ?? "fork") !== "fork") continue;
    const src = nodes.find((n) => n.id === e.source);
    if (src?.kind !== "skill") continue;
    const c = readSkill(e.source);
    if (c) parts.push(c);
  }
  return parts.length ? parts.join("\n\n") : undefined;
}

/** 确保技能文件存在（无则播种 starter，绝不覆盖）。返回 { path, created } */
export function ensureSkill(nodeId: string): { path: string; created: boolean } {
  const p = skillPath(nodeId);
  if (existsSync(p)) return { path: p, created: false };
  try {
    mkdirSync(SKILLS_DIR(), { recursive: true });
    writeFileSync(p, STARTER_SKILL, "utf8");
    return { path: p, created: true };
  } catch {
    return { path: p, created: false };
  }
}
