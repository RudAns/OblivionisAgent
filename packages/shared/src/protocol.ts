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
  | { type: "get-audit" };

export interface AuditEntry {
  chatId: string;
  senderId: string;
  sender: string;
  text: string;
  ts: number;
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
  | { type: "audit-history"; items: AuditEntry[] };

export type FeishuStatus = "disconnected" | "connecting" | "connected" | "error" | "mock";

export const DEFAULT_WS_PORT = 8920;
