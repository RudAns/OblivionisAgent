import type { OblivionisConfig } from "./config.js";
import type { ClaudeStreamEvent } from "./stream-json.js";

/** Bridge <-> GUI 之间的本地 WebSocket 协议 */

export type SessionStatus = "idle" | "running" | "error";

/** GUI -> Bridge */
export type ClientMessage =
  | { type: "get-config" }
  | { type: "set-config"; config: OblivionisConfig }
  /** 从 GUI 手动给某个会话节点发一条消息（绕过飞书，便于调试） */
  | { type: "send-to-session"; nodeId: string; text: string }
  /** 干跑：模拟一条消息走路由(含意图分类)，只看命中哪条链路/会话，不真发飞书、不真跑会话 */
  | { type: "route-test"; chatId: string; text: string }
  /** 打开某个会话节点的真实交互式终端(PTY) */
  | { type: "pty-open"; nodeId: string }
  | { type: "pty-input"; ptyId: string; data: string }
  | { type: "pty-resize"; ptyId: string; cols: number; rows: number }
  | { type: "pty-close"; ptyId: string }
  /** 保存飞书应用凭据并(重)连接 */
  | { type: "feishu-set"; appId: string; appSecret: string; domain: "feishu" | "lark" }
  | { type: "feishu-connect" }
  | { type: "feishu-disconnect" }
  /** 列出某工作目录下的所有 Claude 会话（用于挑选 fork 基础会话） */
  | { type: "list-sessions"; cwd: string }
  /** 切换 App 明暗主题时，顺手把 Claude 终端主题写进 ~/.claude/settings.json */
  | { type: "set-claude-theme"; theme: "light" | "dark" }
  /** 用手机号/邮箱查 open_id（在本机刻意设置主人，不依赖飞书消息） */
  | { type: "lookup-openid"; mobile?: string; email?: string }
  /** 重新从基础会话 fork 出访客会话并脱敏（刷新快照） */
  | { type: "prepare-fork"; nodeId: string }
  /** 人格重锚定：保留 fork 历史，往会话静默跑一轮"切换到当前人格"的 primer，
   *  用最近一轮压过旧历史的口吻惯性（轻量版刷新快照，不清记忆） */
  | { type: "reinject-soul"; nodeId: string }
  /** 请求审计历史（从 ~/.oblivionis/audit.jsonl 读取） */
  | { type: "get-audit" }
  /** 确保节点人格文件(SOUL.md)存在（无则播种 starter），回 soul-path */
  | { type: "ensure-soul"; nodeId: string }
  /** 确保技能节点文件(SKILL.md)存在（无则播种 starter），回 open-file 供 GUI 编辑 */
  | { type: "ensure-skill"; nodeId: string }
  /** 确保子代理定义(~/.claude/agents/)存在（无则播种 starter），回 open-file 供 GUI 编辑 */
  | { type: "ensure-subagent"; nodeId: string }
  /** 确保某群的 GROUP.md 存在（无则建模板），回 file-path 供 GUI 打开编辑 */
  | { type: "ensure-group-memory"; chatId: string }
  /** 知识收件箱裁决：accept(可带编辑后规则)→写 cwd 的 CLAUDE.md；dismiss=抛弃 */
  | { type: "knowledge-decide"; id: string; action: "accept" | "dismiss"; editedRule?: string }
  /** 工具权限审批请求（来自 MCP 审批进程，非 GUI）；定向回 permission-response */
  | {
      type: "permission-request";
      requestId: string;
      toolName: string;
      input: unknown;
      ctx: { nodeId?: string; nodeLabel?: string; chatId?: string; senderId?: string; senderName?: string };
    }
  /** 手动触发某个循环节点立即跑一次 */
  | { type: "run-loop"; nodeId: string };

export interface AuditEntry {
  chatId: string;
  senderId: string;
  sender: string;
  text: string;
  ts: number;
}

/** 知识收件箱条目：等主人裁决的提案 */
export interface KnowledgeItem {
  id: string;
  ts: number;
  nodeId: string;
  nodeLabel: string;
  /** kind=rule 时采纳写入该目录的 CLAUDE.md */
  cwd: string;
  chatId: string;
  sender: string;
  /**
   * kind=rule：规则一句话（采纳→追加 CLAUDE.md）
   * kind=soul：修订后的完整 SOUL.md 全文（采纳→覆写人格文件）
   * 采纳前都可编辑。
   */
  rule: string;
  /** 来源摘要 */
  source: string;
  status: "pending" | "accepted" | "dismissed";
  /** 条目类型：rule=群聊沉淀规则(默认)；soul=人格修订提案 */
  kind?: "rule" | "soul";
}

/** Claude 订阅用量快照（5 小时滚动窗口 / 周窗口） */
export interface UsageSnapshot {
  ts: number;
  /** 5 小时窗口已用百分比(0-100) */
  sessionPct?: number;
  /** 5 小时窗口重置时间（人类可读，CLI 原文） */
  sessionResets?: string;
  /** 周窗口(全模型)已用百分比 */
  weekPct?: number;
  weekResets?: string;
  /** CLI 原始文本（解析失败/悬停详情兜底） */
  raw?: string;
}

export interface SessionInfo {
  id: string;
  /** 最近修改时间(ms) */
  mtime: number;
  sizeBytes: number;
  /** 该会话第一条用户消息的预览，便于辨认 */
  preview: string;
}

/** Bridge -> GUI */
export type BridgeMessage =
  | { type: "config"; config: OblivionisConfig }
  | { type: "log"; level: "info" | "warn" | "error"; msg: string; ts: number }
  /** 收到的飞书入站消息（镜像给 GUI 展示） */
  | { type: "inbound"; chatId: string; senderId: string; sender: string; text: string; ts: number }
  /** 某会话节点产生的一条 stream-json 事件 */
  | {
      type: "session-event";
      nodeId: string;
      sessionId: string;
      event: ClaudeStreamEvent;
    }
  | {
      type: "session-status";
      nodeId: string;
      sessionId: string;
      status: SessionStatus;
    }
  /** 运行时实际走过的连线（用于画布"只点亮真实链路"，避免汇聚会话两条入边都亮）。
   *  runId 唯一标识本轮入站（按消息 id）——多个群并发触发同一会话时各自独立点亮、互不覆盖。
   *  edgeIds 为空 = 清除该 runId 的活动链路。 */
  | { type: "session-active-path"; runId: string; nodeId: string; edgeIds: string[] }
  /** 干跑路由结果（响应 route-test）：命中哪个会话节点 / 走过哪些连线 / 最终发给 Claude 的文本 */
  | {
      type: "route-test-result";
      matched: boolean;
      nodeId?: string;
      nodeLabel?: string;
      pathEdgeIds: string[];
      finalText?: string;
      error?: string;
    }
  /** 各会话节点的原始(base)/脱敏分身(fork) transcript 最终修改时间(ms)，给节点卡显示"最终修改日期" */
  | { type: "session-meta"; metas: Record<string, { base?: number; fork?: number }> }
  /** 循环节点运行进度：第 round/max 轮、是否仍在跑、一行备注（结束/停因）。供节点卡与检视显示。 */
  | { type: "loop-progress"; nodeId: string; round: number; max: number; running: boolean; note?: string }
  /** 回灌到飞书的出站消息（镜像给 GUI 展示） */
  | { type: "outbound"; chatId: string; text: string; ts: number }
  | { type: "pty-opened"; ptyId: string; nodeId: string }
  | { type: "pty-data"; ptyId: string; data: string }
  | { type: "pty-exit"; ptyId: string; code: number | null }
  /** 飞书连接状态（连接/认证/机器人身份） */
  | {
      type: "feishu-status";
      status: FeishuStatus;
      detail?: string;
      bot?: { openId?: string; name?: string; appId?: string };
    }
  /** 某工作目录下的会话列表（响应 list-sessions） */
  | { type: "sessions"; cwd: string; items: SessionInfo[] }
  /** open_id 查询结果（响应 lookup-openid） */
  | { type: "openid-result"; items: Array<{ label: string; openId: string }>; error?: string }
  /** 审计历史（响应 get-audit） */
  | { type: "audit-history"; items: AuditEntry[] }
  /** 各会话节点的近期转录回放（连接时下发；保留约 3 天） */
  | { type: "transcript-history"; histories: Record<string, ClaudeStreamEvent[]> }
  /** 订阅用量（5h/周窗口，定时轮询 + 连接时下发） */
  | ({ type: "usage-status" } & UsageSnapshot)
  /** 成本看板汇总（每次会话运行记账后 + 连接时下发） */
  | ({ type: "cost-summary" } & CostSnapshot)
  /** 人格文件路径（响应 ensure-soul；created=本次播种了 starter） */
  | { type: "soul-path"; nodeId: string; path: string; created: boolean }
  /** 群记忆文件路径（响应 ensure-group-memory），GUI 用 VSCode 打开 */
  | { type: "open-file"; path: string }
  /** 知识收件箱全量（连接时 + 每次变更后推送） */
  | { type: "knowledge-inbox"; items: KnowledgeItem[] }
  /** 工具权限审批决定（定向发给发起请求的 MCP 连接） */
  | { type: "permission-response"; requestId: string; behavior: "allow" | "deny"; message?: string };

/** 成本看板汇总：累计 / 今日花费、按会话节点与按天的聚合、最近若干条明细。 */
export interface CostSnapshot {
  total: number; // 累计花费 USD
  today: number; // 今日花费 USD
  runs: number; // 累计运行次数
  perNode: { nodeId: string; label: string; cost: number; runs: number; lastTs: number }[];
  daily: { day: string; cost: number; runs: number }[]; // 近 14 天
  recent: {
    ts: number;
    nodeId: string;
    label: string;
    model?: string;
    cost: number;
    turns: number;
    durationMs: number;
    ctxTokens: number;
    outTokens: number;
  }[];
}

export type FeishuStatus = "disconnected" | "connecting" | "connected" | "error" | "mock";

export const DEFAULT_WS_PORT = 8920;
