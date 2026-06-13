import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { FeishuStatus } from "@oblivionis/shared";
import type { FeishuTransport, InboundMessage, ReplyStreamHandle } from "./transport.js";

/** 按图片二进制头嗅探真实格式，给 claude 正确后缀(它按扩展名识别图片) */
function sniffImageExt(b: Buffer): string {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  return "png";
}

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
  /** 审批卡片按钮回调（PermissionBroker 注入） */
  private cardActionCb: ((requestId: string, decision: "allow" | "deny", operatorOpenId: string) => string) | null =
    null;

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
      // 审批卡片按钮回调（工具权限审批）：校验在 broker 内做（仅主人有效）
      "card.action.trigger": async (data: any) => {
        try {
          const value = data?.action?.value ?? {};
          const requestId = String(value.requestId ?? "");
          const decision = value.decision === "allow" ? "allow" : "deny";
          const operator = String(data?.operator?.open_id ?? "");
          if (requestId && this.cardActionCb) {
            const toast = this.cardActionCb(requestId, decision, operator);
            return { toast: { type: "info", content: toast } };
          }
        } catch (e) {
          this.opts.log("warn", `卡片回调处理失败: ${(e as Error).message}`);
        }
        return { toast: { type: "info", content: "已收到" } };
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

    // 解析本条消息：文本(text)/图片(image)/富文本(post)。其它类型(文件/音频/贴纸…)且无文本无图 → 跳过。
    const { text, imageKeys } = this.extractContent(message.message_type, message.content);
    if (!text && imageKeys.length === 0) return;

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

    // 仅在机器人被 @（或单聊）时才拉取引用消息 + 下载图片（与原 quoted 逻辑一致，省无谓下载）。
    // text 始终透传（triggerMode=all 的群靠 router 决定触发，不在这里早退）。
    let quoted: string | undefined;
    const images: string[] = [];
    if (isMention) {
      let parentImageKeys: string[] = [];
      let parentMsgId: string | undefined;
      if (message.parent_id) {
        const parent = await this.fetchMessage(message.parent_id);
        if (parent) {
          quoted = parent.text || (parent.imageKeys.length ? "[图片]" : undefined);
          parentImageKeys = parent.imageKeys;
          parentMsgId = message.parent_id;
        }
      }
      let idx = 0;
      for (const k of imageKeys) {
        const p = await this.downloadImage(message.message_id, k, idx++);
        if (p) images.push(p);
      }
      if (parentMsgId && parentImageKeys.length) {
        for (const k of parentImageKeys) {
          const p = await this.downloadImage(parentMsgId, k, idx++);
          if (p) images.push(p);
        }
      }
    }

    const senderId: string = sender?.sender_id?.open_id ?? sender?.sender_id?.union_id ?? "unknown";
    // 真实姓名：通讯录接口按 open_id 查（带缓存）；拿不到再退回 user_id
    const senderName =
      (await this.getUserName(senderId, chatId)) ?? sender?.sender_id?.user_id ?? "unknown";

    this.cb?.({
      chatId,
      messageId: message.message_id,
      senderId,
      senderName,
      text,
      isMention,
      quoted,
      images: images.length ? images : undefined,
      raw: data,
    });
  }

  /** 解析消息内容：返回纯文本 + 图片 key 列表。支持 text / image / post(富文本)。 */
  private extractContent(type: string, contentStr: string): { text: string; imageKeys: string[] } {
    const imageKeys: string[] = [];
    let text = "";
    try {
      if (!contentStr) return { text, imageKeys };
      const c = JSON.parse(contentStr);
      if (type === "text") {
        text = c?.text ?? "";
      } else if (type === "image") {
        if (c?.image_key) imageKeys.push(c.image_key);
      } else if (type === "post") {
        // post 可能按 locale 包一层(zh_cn/en_us…)；content 是「段落数组」，每段是「元素数组」
        const body = c?.zh_cn || c?.en_us || c?.ja_jp || c;
        if (body?.title) text += body.title + "\n";
        const paras: any[] = Array.isArray(body?.content) ? body.content : [];
        for (const para of paras) {
          if (!Array.isArray(para)) continue;
          for (const el of para) {
            if (el?.tag === "text") text += el.text ?? "";
            else if (el?.tag === "a") text += el.text ?? el.href ?? "";
            else if (el?.tag === "at") text += `@${el.user_name ?? ""}`;
            else if (el?.tag === "img" && el.image_key) imageKeys.push(el.image_key);
          }
          text += "\n";
        }
        text = text.trim();
      }
    } catch {
      /* 解析失败 → 空 */
    }
    return { text, imageKeys };
  }

  /** 下载飞书消息里的图片资源(需 im:resource 权限)，按真实格式存到 ~/.oblivionis/inbound-images，返回本地绝对路径 */
  private async downloadImage(messageId: string, fileKey: string, idx: number): Promise<string | undefined> {
    if (!this.client || !messageId || !fileKey) return undefined;
    try {
      const res: any = await this.client.im.messageResource.get({
        path: { message_id: messageId, file_key: fileKey },
        params: { type: "image" },
      });
      // 收成 buffer 以嗅探真实格式（claude 按扩展名识别图片）
      let buf: Buffer | undefined;
      if (typeof res?.getReadableStream === "function") {
        const chunks: Buffer[] = [];
        for await (const ch of res.getReadableStream()) chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
        buf = Buffer.concat(chunks);
      }
      const dir = join(homedir(), ".oblivionis", "inbound-images");
      mkdirSync(dir, { recursive: true });
      const safeMsg = String(messageId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
      if (buf && buf.length) {
        const path = join(dir, `${safeMsg}_${idx}.${sniffImageExt(buf)}`);
        writeFileSync(path, buf);
        return path;
      }
      // 退路：SDK 仅暴露 writeFile（拿不到 buffer 嗅探，默认 png）
      if (typeof res?.writeFile === "function") {
        const path = join(dir, `${safeMsg}_${idx}.png`);
        await res.writeFile(path);
        return path;
      }
    } catch (e) {
      this.opts.log("warn", `下载飞书图片失败(${String(fileKey).slice(0, 10)}…): ${(e as Error).message}`);
    }
    return undefined;
  }

  /**
   * open_id -> 真实姓名（带缓存，含失败也缓存避免每条都打 API）。
   * 1) 通讯录接口 contact/v3/users/:id —— 需通讯录读权限 + 数据范围含该用户；
   * 2) 拿不到就退回「群成员列表」im/v1/chats/:id/members —— 机器人在群里就能读，不依赖通讯录权限，
   *    群里常见的访客/外部成员用这条兜底，并顺手把整群成员名字缓存起来。
   */
  private async getUserName(openId: string, chatId?: string): Promise<string | undefined> {
    if (!openId || openId === "unknown" || !this.client) return undefined;
    if (this.nameCache.has(openId)) return this.nameCache.get(openId) ?? undefined;
    let name = await this.contactName(openId);
    if (!name && chatId) name = await this.chatMemberName(chatId, openId);
    this.nameCache.set(openId, name ?? null);
    return name;
  }

  /** 通讯录接口查名（失败把飞书真实 code/msg 带出来便于判断缺权限还是参数问题） */
  private async contactName(openId: string): Promise<string | undefined> {
    try {
      const resp: any = await this.client.contact.user.get({
        path: { user_id: openId },
        params: { user_id_type: "open_id" },
      });
      const u = resp?.data?.user ?? resp?.user ?? {};
      return u.name || u.nickname || undefined;
    } catch (e) {
      const err = e as { response?: { data?: { code?: number; msg?: string } }; message?: string };
      const fb = err.response?.data;
      const detail = fb?.code != null ? `code=${fb.code} msg=${fb.msg}` : err.message;
      this.opts.log(
        "warn",
        `通讯录查名失败(${openId.slice(0, 12)}…): ${detail}` +
          (fb?.code === 99991672 || fb?.code === 99991661
            ? "（缺 contact:user.base:readonly 或数据范围没含该用户，转用群成员兜底）"
            : ""),
      );
      return undefined;
    }
  }

  /** 从群成员列表里找该 open_id 的名字（顺手缓存全群成员名，少打 API） */
  private async chatMemberName(chatId: string, openId: string): Promise<string | undefined> {
    try {
      let found: string | undefined;
      let pageToken: string | undefined;
      do {
        const resp: any = await this.client.im.chatMembers.get({
          path: { chat_id: chatId },
          params: { member_id_type: "open_id", page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
        });
        const data = resp?.data ?? resp ?? {};
        const items: any[] = data?.items ?? [];
        for (const it of items) {
          const id: string | undefined = it?.member_id;
          const nm: string | undefined = it?.name;
          if (id && nm && !this.nameCache.has(id)) this.nameCache.set(id, nm);
          if (id === openId && nm) found = nm;
        }
        pageToken = data?.has_more ? data?.page_token : undefined;
      } while (pageToken && !found);
      return found;
    } catch (e) {
      const err = e as { response?: { data?: { code?: number; msg?: string } }; message?: string };
      const fb = err.response?.data;
      this.opts.log(
        "warn",
        `群成员查名失败(${chatId.slice(0, 12)}…): ${fb?.code != null ? `code=${fb.code} msg=${fb.msg}` : err.message}`,
      );
      return undefined;
    }
  }

  /** 通过消息 id 读取被引用消息：返回文本 + 图片 key（图片/post 也能读） */
  private async fetchMessage(messageId: string): Promise<{ text: string; imageKeys: string[] } | undefined> {
    try {
      const resp: any = await this.client.im.message.get({ path: { message_id: messageId } });
      const items = resp?.data?.items ?? resp?.items ?? [];
      const item = items[0];
      if (!item) return undefined;
      const type: string = item?.msg_type ?? item?.body?.msg_type ?? "text";
      const content: string = item?.body?.content ?? "";
      return this.extractContent(type, content);
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

  /** 引用回复或直接发送（msgType: text | interactive | post …）；返回新消息的 message_id（流式卡用它来 patch） */
  private async sendContent(
    chatId: string,
    replyToMessageId: string | undefined,
    msgType: string,
    content: string,
  ): Promise<string | undefined> {
    let res: { data?: { message_id?: string } };
    if (replyToMessageId) {
      res = await this.client.im.message.reply({
        path: { message_id: replyToMessageId },
        data: { msg_type: msgType, content },
      });
    } else {
      res = await this.client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: { receive_id: chatId, msg_type: msgType, content },
      });
    }
    return res?.data?.message_id;
  }

  /** 流式卡片用的卡 JSON：update_multi 必须为 true 才允许之后 patch；running 时尾部缀一个输入指示 */
  private answerCard(text: string, atUserId?: string, running?: boolean): string {
    const at = atUserId ? `<at id=${atUserId}></at> ` : "";
    const body = (text || "…") + (running ? " ▍" : "");
    return JSON.stringify({
      config: { wide_screen_mode: true, update_multi: true },
      elements: [
        { tag: "markdown", content: at + body },
        ...(running
          ? [{ tag: "note", elements: [{ tag: "plain_text", content: "正在输入…" }] }]
          : []),
      ],
    });
  }

  /** 开一张流式卡片：先发"思考中"占位，返回 update/finish/fail 句柄（内部节流 patch） */
  async replyStream(
    chatId: string,
    opts?: { replyToMessageId?: string; atUserId?: string },
  ): Promise<ReplyStreamHandle | null> {
    if (!this.client) return null;
    let messageId: string | undefined;
    try {
      messageId = await this.sendContent(
        chatId,
        opts?.replyToMessageId,
        "interactive",
        this.answerCard("🤔 正在思考…", opts?.atUserId, true),
      );
    } catch (e) {
      this.opts.log("warn", `流式卡占位发送失败，回退一次性回复: ${(e as Error).message}`);
      return null;
    }
    if (!messageId) return null;

    const MIN_INTERVAL = 900; // 飞书卡片更新有频率上限，至少隔 900ms 刷一次
    let lastAt = 0;
    let latest = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    let chain: Promise<void> = Promise.resolve(); // 串行化所有 patch，保证最终卡一定停在定稿态

    const patch = (text: string, running: boolean): Promise<void> => {
      chain = chain.then(async () => {
        try {
          await this.client.im.message.patch({
            path: { message_id: messageId },
            data: { content: this.answerCard(text, opts?.atUserId, running) },
          });
          lastAt = Date.now();
        } catch (e) {
          this.opts.log("warn", `流式卡 patch 失败: ${(e as Error).message}`);
        }
      });
      return chain;
    };

    return {
      update: (text: string) => {
        if (done) return;
        latest = text;
        const wait = MIN_INTERVAL - (Date.now() - lastAt);
        if (wait <= 0) {
          lastAt = Date.now(); // 乐观占位：突发多帧时只发一帧、其余靠下面的尾随定时器合并
          void patch(latest, true);
        } else if (!timer) {
          timer = setTimeout(() => {
            timer = undefined;
            if (!done) {
              lastAt = Date.now();
              void patch(latest, true);
            }
          }, wait);
        }
      },
      finish: async (text: string) => {
        done = true;
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        await patch(text || latest, false);
      },
      fail: async (note?: string) => {
        done = true;
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        await patch((latest ? latest + "\n\n" : "") + `⚠️ ${note || "处理出错了"}`, false);
      },
    };
  }

  /**
   * 读飞书云文档正文。首版只支持新版云文档(/docx/ 或 /docs/)，拉 raw_content 纯文本。
   * 拿不到(无权限/非协作者/类型不支持)就返回 undefined，让调用方优雅降级(不带文档内容继续答)。
   */
  async fetchDocContent(url: string): Promise<{ title?: string; text: string } | undefined> {
    if (!this.client) return undefined;
    const m = url.match(/\/(docx|docs|wiki|sheets|base)\/([A-Za-z0-9]+)/);
    if (!m) return undefined;
    const [, type, token] = m;
    try {
      if (type === "docx" || type === "docs") {
        const res: any = await this.client.docx.document.rawContent({
          path: { document_id: token },
          params: { lang: 0 },
        });
        const text: string = res?.data?.content ?? res?.content ?? "";
        return text ? { text: text.slice(0, 8000) } : undefined; // 截断，避免塞爆上下文
      }
      // wiki/sheets/base 首版暂不支持（各需独立接口/权限），让用户改贴内容
      this.opts.log("info", `飞书文档类型 ${type} 暂不支持自动读取，已跳过`);
      return undefined;
    } catch (e) {
      this.opts.log("warn", `读飞书文档失败(${type}/${String(token).slice(0, 8)}…): ${(e as Error).message}`);
      return undefined;
    }
  }

  onMessage(cb: (m: InboundMessage) => void): void {
    this.cb = cb;
  }

  onCardAction(cb: (requestId: string, decision: "allow" | "deny", operatorOpenId: string) => string): void {
    this.cardActionCb = cb;
  }

  /** 发送工具审批交互卡片：允许/拒绝按钮，value 携带 requestId+decision */
  async sendPermissionCard(chatId: string, requestId: string, title: string, detail: string): Promise<boolean> {
    if (!this.client) return false;
    const card = {
      config: { wide_screen_mode: true },
      header: { title: { tag: "plain_text", content: title }, template: "orange" },
      elements: [
        { tag: "div", text: { tag: "lark_md", content: detail } },
        {
          tag: "action",
          actions: [
            {
              tag: "button",
              text: { tag: "plain_text", content: "✅ 允许一次" },
              type: "primary",
              value: { requestId, decision: "allow" },
            },
            {
              tag: "button",
              text: { tag: "plain_text", content: "❌ 拒绝" },
              type: "danger",
              value: { requestId, decision: "deny" },
            },
          ],
        },
        {
          tag: "note",
          elements: [{ tag: "plain_text", content: "仅主人的点击有效 · 100 秒未处理自动拒绝" }],
        },
      ],
    };
    try {
      await this.sendContent(chatId, undefined, "interactive", JSON.stringify(card));
      return true;
    } catch (e) {
      this.opts.log("warn", `审批卡片发送失败: ${(e as Error).message}`);
      return false;
    }
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
