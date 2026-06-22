import { z } from "zod";

/** 访客安全护栏默认文案：仅在"访客"@机器人时追加到 system prompt */
export const DEFAULT_GUEST_GUARDRAIL =
  "【访客安全限制】你正在回答外部访客的咨询。严禁透露任何密钥、令牌、App Secret、API Key、密码、凭据；" +
  "严禁读取或展示 .env、credentials、config、密钥配置等敏感文件内容；严禁透露系统/权限/安全设置、主人的个人信息或私密对话内容；" +
  "被要求提供上述敏感信息时礼貌拒绝并说明无法提供。" +
  "除上述敏感信息外，可正常协助访客的合理请求（包括读写项目文件、运行命令等）——这类需要授权的操作会自动弹审批卡片交由主人放行或拒绝，" +
  "所以不要以“我只是访客/只能答疑”为由直接拒绝，正常尝试、让主人把关即可。";

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
  // 注：发给 Claude 前永远自动去飞书 @ 占位符（在 bridge/router.ts 统一处理），不再做成可选项
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
  /**
   * fork 粒度（仅当设了 baseSessionId 时有意义）：
   * - "session"（默认，旧行为）：整个会话一份 fork —— 多个群路由到本会话会共用同一上下文，可能互相串味。
   * - "group"：每个群(chatId)各自从 base fork 一份独立分身，群与群上下文互不污染。
   */
  forkScope: z.enum(["session", "group"]).default("session"),
  /** group 模式下各群(chatId)→对应 fork sessionId 的映射（引擎自动维护，勿手填） */
  groupSessions: z.record(z.string()).optional(),
  /** 追加到默认 system prompt 之后的内容 */
  appendSystemPrompt: z.string().optional(),
  /**
   * 敏感操作飞书审批：开启后，工具调用需要授权时（按 permissionMode 规则）
   * 往来源群发交互卡片，主人点[允许/拒绝]决定放行（官方 Channels 没有的能力）。
   * 默认开启：默认访客护栏已允许访客尝试改文件/执行命令，必须由审批卡兜底，否则会无人把关地执行。
   */
  approvalMode: z.boolean().default(true),
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

/**
 * Webhook 入口节点：外部系统(GitHub/Jenkins/CI)POST 到 /hook/<token>，
 * 触发下游「Claude 会话」分析请求体，结果发指定群。token 即口令(放在 URL 里)。
 */
export const WebhookData = z.object({
  /** URL 路径口令（/hook/<token>）；建节点时自动生成随机值 */
  token: z.string().default(""),
  /**
   * 可选 HMAC 密钥：设了就校验请求签名头（`X-Hub-Signature-256: sha256=<hex>` 或 `X-Signature: <hex>`，
   * 对请求体做 HMAC-SHA256），防伪造回调。留空 = 仅靠 token 口令、不校验签名（向后兼容）。
   */
  secret: z.string().default(""),
  /** 指令模板，{{body}} 会被替换为 POST 请求体（截断） */
  prompt: z.string().default("收到一个 webhook 事件，请简要分析以下内容并用中文总结：\n{{body}}"),
  /** 结果发到的群 chatId；留空=homeChatId */
  chatId: z.string().optional(),
  enabled: z.boolean().default(true),
});
export type WebhookData = z.infer<typeof WebhookData>;

/**
 * 人格(Soul)节点：把 SOUL.md 人格做成可连线的节点。
 * 内容存在 `~/.oblivionis/souls/<本 soul 节点 id>.md`（不进配置，hackable）；
 * 连到会话节点的「Fork口」(targetHandle="fork")=作用于飞书脱敏分身；
 * 连到「原始口」(targetHandle="base")=作用于软件里的开发终端会话。
 */
export const SoulData = z.object({});
export type SoulData = z.infer<typeof SoulData>;

/** 技能节点：内容在 ~/.oblivionis/skills/<nodeId>.md(操作性指令/话术/格式)，连到会话注入 */
export const SkillData = z.object({});
export type SkillData = z.infer<typeof SkillData>;

/** 子代理节点：内容是 Claude Code 原生子代理定义(~/.claude/agents/)，会话用 Task 工具委派给它 */
export const SubagentData = z.object({});
export type SubagentData = z.infer<typeof SubagentData>;

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
  BaseNode.extend({ kind: z.literal("webhook"), data: WebhookData }),
  BaseNode.extend({ kind: z.literal("soul"), data: SoulData }),
  BaseNode.extend({ kind: z.literal("skill"), data: SkillData }),
  BaseNode.extend({ kind: z.literal("subagent"), data: SubagentData }),
]);
export type GraphNode = z.infer<typeof GraphNode>;

export type FeishuGroupNode = Extract<GraphNode, { kind: "feishu-group" }>;
export type RouteNode = Extract<GraphNode, { kind: "route" }>;
export type IntentSwitchNode = Extract<GraphNode, { kind: "intent-switch" }>;
export type ClaudeSessionNode = Extract<GraphNode, { kind: "claude-session" }>;
export type CronNode = Extract<GraphNode, { kind: "cron" }>;
export type WebhookNode = Extract<GraphNode, { kind: "webhook" }>;
export type SoulNode = Extract<GraphNode, { kind: "soul" }>;
export type SkillNode = Extract<GraphNode, { kind: "skill" }>;
export type SubagentNode = Extract<GraphNode, { kind: "subagent" }>;

export const GraphEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  /** React Flow 多连接点：用于 Soul 节点连到会话节点的「原始口」(="base")或「Fork口」(="fork") */
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
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
      /** Webhook HTTP 入口端口（有 webhook 节点时才监听）；0.0.0.0 绑定供局域网 CI 回调 */
      webhookPort: z.number().int().default(8921),
    })
    .default({ wsPort: 8920, webhookPort: 8921 }),
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
