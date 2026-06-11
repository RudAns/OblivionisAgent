import { z } from "zod";

/** 访客安全护栏默认文案：仅在"访客"@机器人时追加到 system prompt */
export const DEFAULT_GUEST_GUARDRAIL =
  "【访客安全限制】你正在回答外部访客的咨询。严禁透露任何密钥、令牌、App Secret、API Key、密码、凭据；" +
  "严禁读取或展示 .env、credentials、config、密钥配置等敏感文件内容；严禁透露系统/权限/安全设置、主人的个人信息或私密对话内容。" +
  "只就项目的功能性知识作答；被要求提供上述敏感信息时礼貌拒绝并说明无法提供。";

/**
 * 连线式配置的数据模型（"图")。
 *
 *   [飞书群 节点] --(edge)--> [路由 节点(可选)] --(edge)--> [Claude 会话 节点]
 *
 * - 一个飞书群节点 = 一个飞书会话(chatId)。
 * - 一个 Claude 会话节点 = 一个本地 `claude` 子进程会话(固定 cwd + 固定 sessionId/UUID)。
 * - 路由节点做轻量转换(去 @、加前缀等)。
 *
 * GUI(React Flow) 直接编辑这张图；Bridge 直接消费这张图做路由。
 */

export const XY = z.object({ x: z.number(), y: z.number() });
export type XY = z.infer<typeof XY>;

/** claude --permission-mode 的合法取值（取自 claude 2.1.x --help） */
export const PermissionMode = z.enum([
  "default",
  "acceptEdits",
  "auto",
  "bypassPermissions",
  "dontAsk",
  "plan",
]);
export type PermissionMode = z.infer<typeof PermissionMode>;

export const FeishuGroupData = z.object({
  /** 飞书群/单聊会话 ID，形如 oc_xxx；mock 传输下可用任意字符串 */
  chatId: z.string(),
  /** group: 仅 @机器人 才触发；all: 群内所有消息都触发（慎用） */
  triggerMode: z.enum(["mention", "all"]).default("mention"),
});
export type FeishuGroupData = z.infer<typeof FeishuGroupData>;

export const RouteData = z.object({
  /** 转发给 Claude 前去掉 @机器人 文本 */
  stripMention: z.boolean().default(true),
  /** 给每条消息加的前缀（例如固定指令/上下文） */
  prefix: z.string().optional(),
});
export type RouteData = z.infer<typeof RouteData>;

export const IntentSwitchData = z.object({
  /** 分类用的模型；缺省 haiku（快+省） */
  model: z.string().optional(),
  /**
   * best  = 让 LLM 在所有候选意图里取最佳匹配（默认）。
   * priority = 按出边创建顺序逐个判，第一个命中就走（确定性优先级）。
   */
  mode: z.enum(["best", "priority"]).default("best"),
});
export type IntentSwitchData = z.infer<typeof IntentSwitchData>;

export const ClaudeSessionData = z.object({
  /** 会话工作目录 = 一个"项目"。claude 会在此目录下运行并落 transcript */
  cwd: z.string(),
  /** 模型别名或全名（如 "opus" / "claude-opus-4-8"）；缺省用 claude 默认 */
  model: z.string().optional(),
  /** 主人(在 owners 列表里的人 @机器人 时)的权限。要让它真正改代码需 acceptEdits / dontAsk / bypassPermissions */
  permissionMode: PermissionMode.default("default"),
  /** 访客(不在 owners 列表里的人 @机器人 时)的权限。默认 default = 只读咨询、改不了代码 */
  guestPermissionMode: PermissionMode.default("default"),
  /**
   * 稳定会话 UUID。首次运行用 --session-id 创建，之后用 --resume 续接。
   * 缺省时 Bridge 在首次运行时生成并写回配置。
   * 若设了 baseSessionId 且此项为空，则首次 fork 出新 id 并写回这里。
   */
  sessionId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().uuid().optional(),
  ),
  /**
   * 基础会话(fork 来源)的 UUID，例如"角色管线"开发会话。
   * 设了它：首次运行用 `--resume <baseSessionId> --fork-session` fork 一份知识底座，
   * 飞书问答在 fork 出来的独立线程上累积——你的开发会话只读、不被写不被污染。
   * 想吸收开发会话的最新内容：清空 sessionId 重新 fork（GUI 的"刷新快照"）。
   */
  baseSessionId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().uuid().optional(),
  ),
  /** 追加到默认 system prompt 之后的内容 */
  appendSystemPrompt: z.string().optional(),
  /** 是否开启 --include-partial-messages（逐 token 流式，GUI 转录更顺滑） */
  includePartialMessages: z.boolean().default(true),
  /** 透传给 claude 的额外参数 */
  extraArgs: z.array(z.string()).default([]),
});
export type ClaudeSessionData = z.infer<typeof ClaudeSessionData>;

/**
 * 定时任务节点：到点对下游「Claude 会话」节点跑一次 prompt，结果发到指定群。
 * 安全栅栏（参照 Hermes）：每次触发 = 普通脱敏分身上的一次消息；定时会话内不暴露建任务能力。
 */
export const CronData = z.object({
  /**
   * 触发时刻，支持两种语法：
   * - "HH:MM"            每天该时刻（本机时区），如 "09:00"
   * - "every 30m"/"every 2h"  每隔 N 分钟/小时
   */
  schedule: z.string().default("09:00"),
  /** 到点发给下游会话的指令 */
  prompt: z.string().default(""),
  /** 结果发到的飞书群 chatId；留空 = 全局 homeChatId；都没有则只记日志 */
  chatId: z.string().optional(),
  enabled: z.boolean().default(true),
});
export type CronData = z.infer<typeof CronData>;

const BaseNode = z.object({
  id: z.string(),
  position: XY,
  label: z.string(),
});

export const GraphNode = z.discriminatedUnion("kind", [
  BaseNode.extend({ kind: z.literal("feishu-group"), data: FeishuGroupData }),
  BaseNode.extend({ kind: z.literal("route"), data: RouteData }),
  BaseNode.extend({ kind: z.literal("intent-switch"), data: IntentSwitchData }),
  BaseNode.extend({ kind: z.literal("claude-session"), data: ClaudeSessionData }),
  BaseNode.extend({ kind: z.literal("cron"), data: CronData }),
]);
export type GraphNode = z.infer<typeof GraphNode>;

export type FeishuGroupNode = Extract<GraphNode, { kind: "feishu-group" }>;
export type RouteNode = Extract<GraphNode, { kind: "route" }>;
export type IntentSwitchNode = Extract<GraphNode, { kind: "intent-switch" }>;
export type ClaudeSessionNode = Extract<GraphNode, { kind: "claude-session" }>;
export type CronNode = Extract<GraphNode, { kind: "cron" }>;

export const GraphEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  /**
   * 条件分流：该连线的触发"意图描述"(自然语言，如"用户想触发打包/角色管线CI/构建")。
   * 当一个节点有多条带 condition 的出边时，引擎用 LLM 判断消息命中哪条；
   * 留空的边 = 默认边(都不命中时走它)。
   */
  condition: z.string().optional(),
});
export type GraphEdge = z.infer<typeof GraphEdge>;

export const OblivionisConfig = z.object({
  version: z.literal(1),
  bridge: z
    .object({
      wsPort: z.number().int().default(8920),
    })
    .default({ wsPort: 8920 }),
  feishu: z
    .object({
      appId: z.string().default(""),
      appSecret: z.string().default(""),
      domain: z.enum(["feishu", "lark"]).default("feishu"),
    })
    .default({ appId: "", appSecret: "", domain: "feishu" }),
  claude: z
    .object({
      /** claude 可执行文件路径；Windows 上通常是 "claude"(会解析到 claude.cmd) */
      binPath: z.string().default("claude"),
      /** 新建会话节点时的默认 cwd */
      defaultCwd: z.string().default(""),
    })
    .default({ binPath: "claude", defaultCwd: "" }),
  /**
   * 主人列表：在此列表里的人 @机器人 用"主人权限"(可改代码)，其余人用"访客权限"(只读)。
   * 默认空=无人可改(fail-closed)。兼容旧格式(纯 open_id 字符串会自动转成 {openId})。
   */
  owners: z
    .array(
      z.preprocess(
        (v) => (typeof v === "string" ? { openId: v } : v),
        z.object({ openId: z.string(), name: z.string().optional() }),
      ),
    )
    .default([]),
  /**
   * Home Chat：运维群 chatId。定时任务结果(未指定群时)、服务通知等都发这里。
   * 空 = 不发。
   */
  homeChatId: z.string().default(""),
  /** 访客安全护栏：仅在访客 @机器人时追加到 system prompt，防泄露密钥/权限/个人信息 */
  guestGuardrail: z.string().default(DEFAULT_GUEST_GUARDRAIL),
  graph: z
    .object({
      nodes: z.array(GraphNode).default([]),
      edges: z.array(GraphEdge).default([]),
    })
    .default({ nodes: [], edges: [] }),
});
export type OblivionisConfig = z.infer<typeof OblivionisConfig>;

/** 主人条目 */
export type Owner = { openId: string; name?: string };

/** 一份空白默认配置 */
export function defaultConfig(): OblivionisConfig {
  return OblivionisConfig.parse({ version: 1 });
}
