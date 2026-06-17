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

<!--
想让它「渐进式披露」(平时不占上下文，模型用到才读全文)？在文件最顶部加一段 frontmatter：

---
description: 一句话说明「什么时候该用这个技能」
---

加了之后，系统提示里只放这条描述 + 文件路径，正文由模型命中场景时自己 Read。
不加 frontmatter 则维持「全文常驻」(每条消息都带上)。
-->
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

/**
 * 拆 SKILL.md 的 YAML frontmatter：
 * - 带 `description:` → 走「渐进式披露」(只在系统提示里放用途指针，正文由模型 Read 按需加载)
 * - 不带 frontmatter → 走旧的「全文常驻」(向后兼容已有技能)
 */
function parseSkillFile(text: string): { description?: string; body: string } {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(t);
  if (!m) return { body: t };
  const fm = m[1] ?? "";
  const body = m[2] ?? "";
  const dm = /^description:\s*(.+?)\s*$/m.exec(fm);
  let description = dm?.[1]?.trim().replace(/^["']|["']$/g, "").trim();
  if (!description) description = undefined;
  return { description, body };
}

/**
 * 解析连到某会话节点「人格/技能口」(targetHandle=fork) 的所有技能，拼成注入文本。
 * 渐进式披露：带 `description:` frontmatter 的技能只注入「名字+用途+路径」指针（省上下文），
 * 模型命中场景时自己用 Read 读完整规范；不带 frontmatter 的技能仍全文常驻（兼容旧技能）。
 */
export function resolveSessionSkills(
  config: Pick<OblivionisConfig, "graph">,
  sessionNodeId: string,
): string | undefined {
  const { nodes, edges } = config.graph;
  const eager: string[] = []; // 全文常驻
  const lazy: { name: string; description: string; path: string }[] = []; // 按需加载
  for (const e of edges) {
    if (e.target !== sessionNodeId) continue;
    if ((e.targetHandle ?? "fork") !== "fork") continue;
    const src = nodes.find((n) => n.id === e.source);
    if (src?.kind !== "skill") continue;
    const p = skillPath(e.source);
    if (!existsSync(p)) continue;
    let text: string;
    try {
      text = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    const { description, body } = parseSkillFile(text);
    if (description) {
      lazy.push({ name: (src.label ?? "技能").trim() || "技能", description, path: p });
    } else {
      const b = body.trim();
      if (b) eager.push(b.length > 20_000 ? b.slice(0, 20_000) : b);
    }
  }
  const parts: string[] = [];
  if (eager.length) parts.push(eager.join("\n\n"));
  if (lazy.length) {
    const lines = lazy.map(
      (c) => `- 「${c.name}」：${c.description}\n  命中时**先用 Read 工具读取完整规范再动手**，别凭记忆套：${c.path}`,
    );
    parts.push(
      `【可按需加载的技能（渐进式披露——平时不展开，命中下面描述的场景时务必先 Read 对应文件拿到完整规范）】\n${lines.join("\n")}`,
    );
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
