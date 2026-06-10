import { createInterface } from "node:readline";
import type { FeishuTransport, InboundMessage } from "./transport.js";

export interface MockOptions {
  /** stdin 里不带 chatId 前缀时使用的默认会话 ID */
  defaultChatId: string;
  log: (msg: string) => void;
}

/**
 * 本地调试用传输层（不连飞书）。
 * - 从 stdin 读行作为入站消息：直接输入文本 -> 发给 defaultChatId；
 *   或用 "oc_xxx::你好" 指定 chatId。
 * - reply() 直接打印到控制台。
 * 这样不需要飞书凭据也能把"入站->路由->Claude->回复"整条链路跑通。
 */
export class MockTransport implements FeishuTransport {
  readonly name = "mock";
  private cb: ((m: InboundMessage) => void) | null = null;

  constructor(private opts: MockOptions) {}

  async start(): Promise<void> {
    this.opts.log(
      `MockTransport 已启动：直接在此终端输入文本回车即可模拟飞书消息（默认 chatId=${this.opts.defaultChatId}，或用 "chatId::文本"）`,
    );
    const rl = createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const sep = trimmed.indexOf("::");
      const chatId = sep > 0 ? trimmed.slice(0, sep) : this.opts.defaultChatId;
      const text = sep > 0 ? trimmed.slice(sep + 2) : trimmed;
      this.cb?.({
        chatId,
        senderId: "mock-user",
        senderName: "MockUser",
        text,
        isMention: true,
      });
    });
  }

  async stop(): Promise<void> {}

  async reply(
    chatId: string,
    text: string,
    opts?: { replyToMessageId?: string; atUserId?: string },
  ): Promise<void> {
    const at = opts?.atUserId ? `@${opts.atUserId} ` : "";
    const q = opts?.replyToMessageId ? `(引用 ${opts.replyToMessageId}) ` : "";
    this.opts.log(`↩️  回复 ${chatId}: ${q}${at}${text}`);
  }

  onMessage(cb: (m: InboundMessage) => void): void {
    this.cb = cb;
  }
}
