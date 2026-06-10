/**
 * `claude --output-format stream-json` 输出的事件类型。
 * 字段以本机 claude 2.1.156 实测为准（见 README 的实测样例），用宽松类型兜底未知字段。
 */

export interface StreamInitEvent {
  type: "system";
  subtype: "init";
  session_id: string;
  cwd: string;
  model: string;
  tools: string[];
  permissionMode: string;
  slash_commands?: string[];
  skills?: string[];
  apiKeySource?: string;
  claude_code_version?: string;
  [k: string]: unknown;
}

export interface StreamRateLimitEvent {
  type: "rate_limit_event";
  rate_limit_info: Record<string, unknown>;
  session_id?: string;
  [k: string]: unknown;
}

export interface AssistantContentBlock {
  type: string; // "text" | "tool_use" | "thinking" | ...
  text?: string;
  name?: string; // tool name for tool_use
  input?: unknown;
  [k: string]: unknown;
}

export interface StreamAssistantEvent {
  type: "assistant";
  message: {
    role: "assistant";
    model?: string;
    content: AssistantContentBlock[];
    usage?: Record<string, unknown>;
    [k: string]: unknown;
  };
  session_id: string;
  [k: string]: unknown;
}

export interface StreamUserEvent {
  type: "user";
  message?: unknown; // tool_result 等
  session_id?: string;
  [k: string]: unknown;
}

/** 仅在 --include-partial-messages 时出现，逐 token 增量 */
export interface StreamPartialEvent {
  type: "stream_event";
  event?: unknown;
  session_id?: string;
  [k: string]: unknown;
}

export interface StreamResultEvent {
  type: "result";
  subtype: string; // "success" | "error_max_turns" | ...
  is_error: boolean;
  /** 最终回复文本（用于回灌飞书） */
  result?: string;
  session_id: string;
  total_cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
  [k: string]: unknown;
}

export type ClaudeStreamEvent =
  | StreamInitEvent
  | StreamRateLimitEvent
  | StreamAssistantEvent
  | StreamUserEvent
  | StreamPartialEvent
  | StreamResultEvent
  | { type: string; [k: string]: unknown };

/** 从一个 assistant 事件里抽取纯文本（拼接所有 text block） */
export function assistantText(e: StreamAssistantEvent): string {
  return e.message.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

export function isResult(e: ClaudeStreamEvent): e is StreamResultEvent {
  return e.type === "result";
}
export function isInit(e: ClaudeStreamEvent): e is StreamInitEvent {
  return e.type === "system" && (e as StreamInitEvent).subtype === "init";
}
export function isAssistant(e: ClaudeStreamEvent): e is StreamAssistantEvent {
  return e.type === "assistant";
}
