import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { OblivionisConfig } from "@oblivionis/shared";

/**
 * 人格(SOUL.md)存取 —— 设计照抄 Hermes/OpenClaw 的成熟约定：
 * - 每个会话节点一份 `~/.oblivionis/souls/<nodeId>.md`，纯 markdown，用户可用任何编辑器改（hackable）。
 * - 注入时原文 verbatim 放 --append-system-prompt 第一段(slot #1)，不加包装语。
 * - 只放"性格"；项目规程归 cwd 的 CLAUDE.md —— 人格与操作规程分文件。
 * - 首次"播种" starter 模板，已有文件绝不覆盖。
 * - 安全：访客护栏永远拼在人格之后压轴，并声明优先级（人格不得越权）。
 */

const SOULS_DIR = () => join(homedir(), ".oblivionis", "souls");

const STARTER_SOUL = `# Identity（我是谁）

我是这个群的 AI 助手。我有自己的名字和性格 —— 主人可以在下面随意塑造我。
（示例人设，按喜好整段替换：元气后辈 / 冷静学姐 / 傲娇技术宅 / 古风谋士……）

# Style（我怎么说话）

- 简洁、专业，但不冰冷；中文回答。
- 可以适度用语气词和 emoji（每条消息别超过 2 个）。
- 对常聊天的群友可以记住称呼并使用。

# Avoid（我不做什么）

- 不卖萌过度、不刷屏、不在严肃技术结论上开玩笑。
- 人格只影响表达方式，绝不影响技术事实的准确性。

# Defaults（拿不准时的默认行为）

- 拿不准就先简短回答 + 主动问一句是否需要展开。
- 被纠正语气/风格时，可以更新这份文件来记住（这是我的灵魂文件）。
`;

export function soulPath(nodeId: string): string {
  const safe = nodeId.replace(/[^a-zA-Z0-9-]/g, "_");
  return join(SOULS_DIR(), `${safe}.md`);
}

/** 读取节点人格；不存在/为空返回 undefined（= 不注入） */
export function readSoul(nodeId: string): string | undefined {
  try {
    const p = soulPath(nodeId);
    if (!existsSync(p)) return undefined;
    const text = readFileSync(p, "utf8").trim();
    if (!text) return undefined;
    // 与 Hermes 一致的体积上限，防 prompt 膨胀
    return text.length > 20_000 ? text.slice(0, 20_000) : text;
  } catch {
    return undefined;
  }
}

/** 覆写人格文件（人格修订提案被采纳时用；自动迭代闭环的落点） */
export function writeSoul(nodeId: string, content: string): void {
  try {
    mkdirSync(SOULS_DIR(), { recursive: true });
    writeFileSync(soulPath(nodeId), content.trim() + "\n", "utf8");
  } catch {
    /* ignore */
  }
}

/**
 * 解析某会话节点在指定端口上挂的人格（两端口模型）：
 *   port="fork" → 飞书脱敏分身；port="base" → 软件里的开发终端会话。
 * 优先按连线找「连到该端口的 soul 节点」；找不到且是 fork 端口时，回退旧的"按会话节点 id 存"的人格文件
 * （所以老配置里已有的人格一行不动照常生效）。
 * 返回 { key, content }：key 用于人格反思/写回（soul 节点 id 或 legacy 会话 id），content 为注入原文。
 */
export function resolveSessionSoul(
  config: Pick<OblivionisConfig, "graph">,
  sessionNodeId: string,
  port: "fork" | "base",
): { key: string; content: string } | undefined {
  const { nodes, edges } = config.graph;
  const edge = edges.find((e) => {
    if (e.target !== sessionNodeId) return false;
    if ((e.targetHandle ?? "fork") !== port) return false;
    const src = nodes.find((n) => n.id === e.source);
    return src?.kind === "soul";
  });
  if (edge) {
    const content = readSoul(edge.source);
    return content ? { key: edge.source, content } : undefined;
  }
  // 不再回退"会话内联人格"：没连「🎭 人格节点」= 该会话没人格(用户明确要求)
  return undefined;
}

/** 确保人格文件存在（无则播种 starter，绝不覆盖已有）。返回 { path, created } */
export function ensureSoul(nodeId: string): { path: string; created: boolean } {
  const p = soulPath(nodeId);
  if (existsSync(p)) return { path: p, created: false };
  try {
    mkdirSync(SOULS_DIR(), { recursive: true });
    writeFileSync(p, STARTER_SOUL, "utf8");
    return { path: p, created: true };
  } catch {
    return { path: p, created: false };
  }
}
