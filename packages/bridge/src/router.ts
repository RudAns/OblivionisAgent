import type {
  OblivionisConfig,
  GraphNode,
  ClaudeSessionNode,
} from "@oblivionis/shared";
import type { InboundMessage } from "./transport/transport.js";

export interface RouteResult {
  sessionNode: ClaudeSessionNode;
  /** 经路由节点转换后的、最终发给 Claude 的文本（含路由前缀） */
  text: string;
  /** 用户原始消息（去 @、不含任何路由前缀/系统注入）——知识提取/群记忆只看它，避免把前缀/系统提示词当成规则 */
  userText: string;
  /** 本条消息实际走过的连线 id（群→…→会话）——画布运行时只点亮这条真实链路 */
  pathEdgeIds: string[];
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

  // 消息自带的 @ 占位符 key（如 @_user_1），用于精确剔除，避免误删 email/代码里的 @
  const mentionKeys: string[] = (() => {
    try {
      const ms = (inbound.raw as { message?: { mentions?: Array<{ key?: string }> } })?.message?.mentions;
      return Array.isArray(ms) ? ms.map((m) => String(m?.key ?? "")).filter(Boolean) : [];
    } catch {
      return [];
    }
  })();
  const intentText = stripMentions(inbound.text, mentionKeys); // 用于意图分类的干净用户消息
  let text = inbound.text;
  const visited = new Set<string>();
  const pathEdgeIds: string[] = []; // 累计实际走过的连线
  let cursor: GraphNode | undefined = group;

  while (cursor) {
    if (visited.has(cursor.id)) break; // 防环
    visited.add(cursor.id);

    if (cursor.kind === "route") {
      if (cursor.data.stripMention) text = stripMentions(text, mentionKeys);
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
      if (idx >= 1 && idx <= conditional.length) chosen = conditional[idx - 1]!;
      else if (idx < 0) chosen = fallback!; // 分类器出错：只走默认边，没有就不路由(下面 !chosen → break)，别瞎猜第一条
      else chosen = fallback ?? conditional[0]!; // 都不匹配：有默认边走它，否则退到第一条
    }
    if (!chosen) break;
    pathEdgeIds.push(chosen.id);

    const next: GraphNode | undefined = nodes.find((n) => n.id === chosen!.target);
    if (!next) break;

    if (next.kind === "claude-session") {
      return { sessionNode: next, text: text.trim(), userText: intentText, pathEdgeIds };
    }
    cursor = next;
  }
  return null;
}

/** 去掉飞书 @ 占位符。优先用消息自带的 mention key 精确剔除(不动 user@x.com / @property / @scope/pkg)；
 *  拿不到 key 时只剔飞书占位符 @_user_1 / @_all，仍不误伤普通 @ 文本。 */
function stripMentions(text: string, keys?: string[]): string {
  let t = text;
  if (keys && keys.length) {
    for (const k of keys) if (k) t = t.split(k).join(" ");
  } else {
    t = t.replace(/@_\w+\s?/g, "");
  }
  return t.replace(/\s{2,}/g, " ").trim();
}
