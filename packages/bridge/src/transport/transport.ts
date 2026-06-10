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
  /** 原始事件，便于扩展 */
  raw?: unknown;
}

export interface FeishuTransport {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** 把回复发回某会话。opts 可指定引用某条消息(replyToMessageId)并 @某人(atUserId, open_id) */
  reply(
    chatId: string,
    text: string,
    opts?: { replyToMessageId?: string; atUserId?: string },
  ): Promise<void>;
  /** 注册入站消息回调 */
  onMessage(cb: (msg: InboundMessage) => void): void;
  /** 用手机号/邮箱查 open_id（可选，仅真实传输实现） */
  lookupOpenId?(
    mobile?: string,
    email?: string,
  ): Promise<Array<{ label: string; openId: string }>>;
}
