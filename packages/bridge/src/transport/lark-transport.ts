import type { FeishuStatus } from "@oblivionis/shared";
import type { FeishuTransport, InboundMessage } from "./transport.js";

export interface BotInfo {
  openId?: string;
  name?: string;
  appId?: string;
}

/** 判断一个 mention 是否是 @所有人 */
function isAtAllMention(m: any): boolean {
  const id = m?.id?.open_id ?? m?.id?.user_id ?? "";
  const name = String(m?.name ?? "");
  const key = String(m?.key ?? "");
  return id === "all" || name === "所有人" || name.toLowerCase() === "all" || /_?all\b/i.test(key);
}

export interface LarkOptions {
  appId: string;
  appSecret: string;
  domain: "feishu" | "lark";
  log: (level: "info" | "warn" | "error", msg: string) => void;
  onStatus: (status: FeishuStatus, detail?: string, bot?: BotInfo) => void;
}

/**
 * 飞书/Lark 真实传输层：基于 @larksuiteoapi/node-sdk 的 WebSocket 长连接。
 * 无需公网回调地址（开发者后台「事件订阅」选「长连接」）。
 *
 * 所需权限(scope)：im:message、im:message:send_as_bot、im:chat、im:resource。
 * 入站事件：im.message.receive_v1；出站：im.message.create。
 *
 * 注意：SDK 类型较复杂，这里用 any 包裹以保持脚手架可编译；
 * 接真实凭据联调时再按需收紧类型。
 */
export class LarkTransport implements FeishuTransport {
  readonly name = "lark";
  private cb: ((m: InboundMessage) => void) | null = null;
  private client: any = null;
  private wsClient: any = null;
  /** 机器人自身的 open_id，用于在群里判断是否被 @（启动后异步获取） */
  private botOpenId: string | null = null;
  /** openId -> 真实姓名缓存（通讯录接口结果；失败缓存 null 避免每条消息都打 API） */
  private nameCache = new Map<string, string | null>();

  constructor(private opts: LarkOptions) {}

  async start(): Promise<void> {
    if (!this.opts.appId || !this.opts.appSecret) {
      this.opts.onStatus("error", "缺少 App ID / App Secret");
      throw new Error("缺少飞书凭据");
    }
    this.opts.onStatus("connecting");

    const lark: any = await import("@larksuiteoapi/node-sdk");
    const domain = this.opts.domain === "lark" ? lark.Domain.Lark : lark.Domain.Feishu;
    const baseConfig = {
      appId: this.opts.appId,
      appSecret: this.opts.appSecret,
      domain,
    };

    this.client = new lark.Client(baseConfig);
    this.wsClient = new lark.WSClient(baseConfig);

    // 用一次真实 API 调用验证凭据 + 拿到机器人身份（open_id 用于群内 @ 判断）
    let bot: BotInfo = { appId: this.opts.appId };
    try {
      const resp: any = await this.client.request({ method: "GET", url: "/open-apis/bot/v3/info" });
      const b = resp?.bot ?? resp?.data?.bot ?? {};
      this.botOpenId = b.open_id ?? null;
      bot = { openId: b.open_id, name: b.app_name, appId: this.opts.appId };
      this.opts.log("info", `飞书凭据校验通过：机器人「${b.app_name ?? "?"}」 open_id=${b.open_id ?? "?"}`);
    } catch (e) {
      const msg = (e as Error).message || String(e);
      this.opts.onStatus("error", `凭据校验失败：${msg}`);
      throw new Error(`飞书凭据校验失败：${msg}`);
    }

    const eventDispatcher = new lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data: any) => {
        try {
          await this.handleInbound(data);
        } catch (e) {
          this.opts.log("error", `解析入站消息失败: ${(e as Error).message}`);
        }
      },
    });

    this.wsClient.start({ eventDispatcher });
    this.opts.onStatus("connected", `domain=${this.opts.domain}`, bot);
    this.opts.log("info", `LarkTransport 长连接已启动（domain=${this.opts.domain}）`);
  }

  async stop(): Promise<void> {
    try {
      this.wsClient?.stop?.();
    } catch {
      /* ignore */
    }
    this.opts.onStatus("disconnected");
  }

  private async handleInbound(data: any): Promise<void> {
    const message = data?.message ?? {};
    const sender = data?.sender ?? {};
    const chatId: string = message.chat_id;
    if (!chatId) return;

    // 仅处理文本消息；其它类型(图片/文件/post)后续扩展
    if (message.message_type !== "text") return;

    let text = "";
    try {
      text = JSON.parse(message.content)?.text ?? "";
    } catch {
      text = "";
    }

    const chatType: string = message.chat_type ?? "p2p"; // p2p | group
    const mentions: any[] = Array.isArray(message.mentions) ? message.mentions : [];

    // @所有人 一律过滤：机器人不回（即便同时@了机器人）
    if (mentions.some(isAtAllMention)) {
      this.opts.log("info", "忽略 @所有人 消息");
      return;
    }

    const isMention =
      chatType !== "group" ||
      (this.botOpenId
        ? mentions.some((m) => m?.id?.open_id === this.botOpenId)
        : mentions.length > 0);

    // 回复/引用某条消息并@机器人时，拉取被引用消息原文一并给 Claude
    let quoted: string | undefined;
    if (isMention && message.parent_id) {
      quoted = await this.fetchMessageText(message.parent_id);
    }

    const senderId: string = sender?.sender_id?.open_id ?? sender?.sender_id?.union_id ?? "unknown";
    // 真实姓名：通讯录接口按 open_id 查（带缓存）；拿不到再退回 user_id
    const senderName =
      (await this.getUserName(senderId)) ?? sender?.sender_id?.user_id ?? "unknown";

    this.cb?.({
      chatId,
      messageId: message.message_id,
      senderId,
      senderName,
      text,
      isMention,
      quoted,
      raw: data,
    });
  }

  /** open_id -> 真实姓名（contact/v3/users/:id，需通讯录读权限；结果含失败都缓存） */
  private async getUserName(openId: string): Promise<string | undefined> {
    if (!openId || openId === "unknown" || !this.client) return undefined;
    if (this.nameCache.has(openId)) return this.nameCache.get(openId) ?? undefined;
    try {
      const resp: any = await this.client.contact.user.get({
        path: { user_id: openId },
        params: { user_id_type: "open_id" },
      });
      const u = resp?.data?.user ?? resp?.user ?? {};
      const name: string | undefined = u.name || u.nickname || undefined;
      this.nameCache.set(openId, name ?? null);
      return name;
    } catch (e) {
      this.opts.log("warn", `查用户姓名失败(${openId.slice(0, 12)}…): ${(e as Error).message}`);
      this.nameCache.set(openId, null); // 失败也缓存，避免每条消息都打一次 API
      return undefined;
    }
  }

  /** 通过消息 id 读取文本内容（用于读取被引用消息） */
  private async fetchMessageText(messageId: string): Promise<string | undefined> {
    try {
      const resp: any = await this.client.im.message.get({ path: { message_id: messageId } });
      const items = resp?.data?.items ?? resp?.items ?? [];
      const content = items[0]?.body?.content;
      if (typeof content === "string") {
        try {
          return JSON.parse(content)?.text ?? content;
        } catch {
          return content;
        }
      }
    } catch (e) {
      this.opts.log("warn", `读取被引用消息失败: ${(e as Error).message}`);
    }
    return undefined;
  }

  async reply(
    chatId: string,
    text: string,
    opts?: { replyToMessageId?: string; atUserId?: string },
  ): Promise<void> {
    if (!this.client) throw new Error("LarkTransport 未启动");

    // 优先发交互卡片(markdown)，渲染粗体/列表/代码块/链接；失败则回退纯文本
    const cardAt = opts?.atUserId ? `<at id=${opts.atUserId}></at> ` : "";
    const card = {
      config: { wide_screen_mode: true },
      elements: [{ tag: "markdown", content: cardAt + text }],
    };
    try {
      await this.sendContent(chatId, opts?.replyToMessageId, "interactive", JSON.stringify(card));
      return;
    } catch (e) {
      this.opts.log("warn", `卡片发送失败，回退纯文本: ${(e as Error).message}`);
    }
    const body = opts?.atUserId ? `<at user_id="${opts.atUserId}"></at> ${text}` : text;
    await this.sendContent(chatId, opts?.replyToMessageId, "text", JSON.stringify({ text: body }));
  }

  /** 引用回复或直接发送（msgType: text | interactive | post …） */
  private async sendContent(
    chatId: string,
    replyToMessageId: string | undefined,
    msgType: string,
    content: string,
  ): Promise<void> {
    if (replyToMessageId) {
      await this.client.im.message.reply({
        path: { message_id: replyToMessageId },
        data: { msg_type: msgType, content },
      });
    } else {
      await this.client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: { receive_id: chatId, msg_type: msgType, content },
      });
    }
  }

  onMessage(cb: (m: InboundMessage) => void): void {
    this.cb = cb;
  }

  /** 用手机号/邮箱查 open_id（需通讯录权限 contact:user.id:readonly） */
  async lookupOpenId(
    mobile?: string,
    email?: string,
  ): Promise<Array<{ label: string; openId: string }>> {
    if (!this.client) throw new Error("飞书未连接");
    const mobiles = mobile ? [mobile.trim()] : [];
    const emails = email ? [email.trim()] : [];
    if (mobiles.length === 0 && emails.length === 0) return [];
    const resp: any = await this.client.request({
      method: "POST",
      url: "/open-apis/contact/v3/users/batch_get_id",
      params: { user_id_type: "open_id" },
      data: { mobiles, emails },
    });
    const list: any[] = resp?.data?.user_list ?? resp?.user_list ?? [];
    return list
      .filter((u) => u?.user_id)
      .map((u) => ({ label: u.mobile ?? u.email ?? u.user_id, openId: u.user_id }));
  }
}
