import type {
  OblivionisConfig,
  GraphNode,
  ClaudeSessionNode,
} from "@oblivionis/shared";
import type { InboundMessage } from "./transport/transport.js";

export interface RouteResult {
  sessionNode: ClaudeSessionNode;
  /** 经路由节点转换后的、最终发给 Claude 的文本 */
  text: string;
}

/** 意图分类器：给定消息和候选意图，返回命中第几个(1..N)或 0(都不命中) */
export type ClassifyFn = (
  text: string,
  intents: string[],
  opts?: { model?: string; mode?: "best" | "priority" },
) => Promise<number>;

/**
 * 把一条入站飞书消息解析到目标 Claude 会话节点。
 *   [feishu-group] -> ...(route/分流)... -> [claude-session]
 * 条件分流：某节点有多条带 condition(意图描述) 的出边时，用 classify 选命中的那条；
 * 留空 condition 的边 = 默认边。找不到群/不满足触发/没接到会话节点 -> null。
 */
export async function route(
  config: OblivionisConfig,
  inbound: InboundMessage,
  classify?: ClassifyFn,
): Promise<RouteResult | null> {
  const { nodes, edges } = config.graph;

  const group = nodes.find(
    (n) => n.kind === "feishu-group" && n.data.chatId === inbound.chatId,
  );
  if (!group || group.kind !== "feishu-group") return null;
  if (group.data.triggerMode === "mention" && !inbound.isMention) return null;

  const intentText = stripMentions(inbound.text); // 用于意图分类的干净用户消息
  let text = inbound.text;
  const visited = new Set<string>();
  let cursor: GraphNode | undefined = group;

  while (cursor) {
    if (visited.has(cursor.id)) break; // 防环
    visited.add(cursor.id);

    if (cursor.kind === "route") {
      if (cursor.data.stripMention) text = stripMentions(text);
      if (cursor.data.prefix) text = `${cursor.data.prefix}${text}`;
    }

    const outs = edges.filter((e) => e.source === cursor!.id);
    if (outs.length === 0) break;

    const conditional = outs.filter((e) => e.condition && e.condition.trim());
    const fallback = outs.find((e) => !e.condition || !e.condition.trim());

    let chosen = fallback ?? outs[0];
    if (conditional.length > 0 && classify) {
      const sw = cursor.kind === "intent-switch" ? cursor : undefined;
      const idx = await classify(
        intentText,
        conditional.map((e) => e.condition!.trim()),
        { model: sw?.data.model, mode: sw?.data.mode },
      );
      chosen = idx >= 1 && idx <= conditional.length ? conditional[idx - 1]! : (fallback ?? conditional[0]!);
    }
    if (!chosen) break;

    const next: GraphNode | undefined = nodes.find((n) => n.id === chosen!.target);
    if (!next) break;

    if (next.kind === "claude-session") {
      return { sessionNode: next, text: text.trim() };
    }
    cursor = next;
  }
  return null;
}

/** 去掉飞书富文本里的 @xxx（简化版；真实场景按 mention 列表精确剔除） */
function stripMentions(text: string): string {
  return text.replace(/@\S+\s?/g, "").trim();
}
