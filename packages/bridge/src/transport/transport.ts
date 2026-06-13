/** 飞书传输层抽象：实现可替换（mock / lark SDK / 未来的 Hermes 适配器） */

export interface InboundMessage {
  /** 会话 ID（群 oc_xxx 或单聊） */
  chatId: string;
  /** 本条消息的 message_id（用于引用回复） */
  messageId?: string;
  senderId: string;
  senderName: string;
  /** 纯文本内容 */
  text: string;
  /** 群内是否 @ 了机器人（单聊恒为 true） */
  isMention: boolean;
  /** 被引用/回复的消息原文（用户回复某条消息并@机器人时填充） */
  quoted?: string;
  /** 随消息发来的图片（含被引用消息里的图）下载后的本地绝对路径；交给 claude 用 Read 读图 */
  images?: string[];
  /** 原始事件，便于扩展 */
  raw?: unknown;
}

/**
 * 流式回复句柄：先发一张"思考中"占位卡，随回复增量刷新，最后定稿。
 * update 内部应自带节流(飞书卡片更新有频率上限)；任何一步失败都不应抛给主链路。
 */
export interface ReplyStreamHandle {
  /** 增量刷新（内部节流；text 为累计全文，不是 delta） */
  update(text: string): void;
  /** 定稿：把最终全文写定 */
  finish(text: string): Promise<void>;
  /** 出错收尾（可选附一句错误提示） */
  fail(note?: string): Promise<void>;
}

/** 回复选项：引用某条消息(replyToMessageId)、@某人(atUserId)、标注作答会话(fromLabel)、是否进线程(inThread) */
export interface ReplyOpts {
  replyToMessageId?: string;
  atUserId?: string;
  /** 卡片底部标注是哪个会话/脱敏分身作答（多会话群里区分来源） */
  fromLabel?: string;
  /** 引用回复时是否开成话题(thread)，让同群多话题不串 */
  inThread?: boolean;
}

export interface FeishuTransport {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** 把回复发回某会话 */
  reply(chatId: string, text: string, opts?: ReplyOpts): Promise<void>;
  /**
   * 开一张流式卡片并返回刷新句柄（可选；仅真实传输实现）。
   * 返回 null = 当前发不了流式卡（调用方应回退到一次性 reply()）。
   */
  replyStream?(chatId: string, opts?: ReplyOpts): Promise<ReplyStreamHandle | null>;
  /** 注册入站消息回调 */
  onMessage(cb: (msg: InboundMessage) => void): void;
  /** 用手机号/邮箱查 open_id（可选，仅真实传输实现） */
  lookupOpenId?(
    mobile?: string,
    email?: string,
  ): Promise<Array<{ label: string; openId: string }>>;
  /**
   * 读取用户在消息里粘的飞书云文档正文（可选；仅真实传输）。当前仅支持新版云文档(docx/docs)。
   * 需 docx:document:readonly 权限，且机器人被加为该文档协作者，否则返回 undefined(优雅降级)。
   */
  fetchDocContent?(url: string): Promise<{ title?: string; text: string } | undefined>;
  /** 发送工具审批交互卡片（可选；按钮 value 携带 requestId+decision） */
  sendPermissionCard?(chatId: string, requestId: string, title: string, detail: string): Promise<boolean>;
  /** 注册卡片按钮回调（可选）。回调返回 toast 文案 */
  onCardAction?(cb: (requestId: string, decision: "allow" | "deny", operatorOpenId: string) => string): void;
}
