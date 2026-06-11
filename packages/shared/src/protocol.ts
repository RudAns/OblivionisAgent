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
  /** 用手机号/邮箱查 open_id（在本机刻意设置主人，不依赖飞书消息） */
  | { type: "lookup-openid"; mobile?: string; email?: string }
  /** 重新从基础会话 fork 出访客会话并脱敏（刷新快照） */
  | { type: "prepare-fork"; nodeId: string }
  /** 请求审计历史（从 ~/.oblivionis/audit.jsonl 读取） */
  | { type: "get-audit" }
  /** 确保节点人格文件(SOUL.md)存在（无则播种 starter），回 soul-path */
  | { type: "ensure-soul"; nodeId: string }
  /** 知识收件箱裁决：accept(可带编辑后规则)→写 cwd 的 CLAUDE.md；dismiss=抛弃 */
  | { type: "knowledge-decide"; id: string; action: "accept" | "dismiss"; editedRule?: string }
  /** 工具权限审批请求（来自 MCP 审批进程，非 GUI）；定向回 permission-response */
  | {
      type: "permission-request";
      requestId: string;
      toolName: string;
      input: unknown;
      ctx: { nodeId?: string; nodeLabel?: string; chatId?: string; senderId?: string; senderName?: string };
    };

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
  /** 人格文件路径（响应 ensure-soul；created=本次播种了 starter） */
  | { type: "soul-path"; nodeId: string; path: string; created: boolean }
  /** 知识收件箱全量（连接时 + 每次变更后推送） */
  | { type: "knowledge-inbox"; items: KnowledgeItem[] }
  /** 工具权限审批决定（定向发给发起请求的 MCP 连接） */
  | { type: "permission-response"; requestId: string; behavior: "allow" | "deny"; message?: string };

export type FeishuStatus = "disconnected" | "connecting" | "connected" | "error" | "mock";

export const DEFAULT_WS_PORT = 8920;
