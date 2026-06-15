import type { Logger } from "../logger.js";

export interface PermCtx {
  nodeId?: string;
  nodeLabel?: string;
  chatId?: string;
  senderId?: string;
  senderName?: string;
}

interface PendingPerm {
  resolve: (r: { behavior: "allow" | "deny"; message?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
  toolName: string;
  ctx: PermCtx;
}

export interface PermCardSender {
  /** 发审批卡片；返回是否成功发出 */
  sendCard(chatId: string, requestId: string, title: string, detail: string): Promise<boolean>;
}

/**
 * 权限审批中枢：MCP 审批进程的请求挂起在这里，飞书卡片回调或超时给出决定。
 * 安全规则：
 * - 只有 owners 列表里的人点击有效（访客点了等于没点，回 toast）
 * - 100s 无人响应 → deny（MCP 侧 110s 是兜底）
 * - 没法发卡片（无 chatId/未连接）→ 立即 deny
 */
export class PermissionBroker {
  private pending = new Map<string, PendingPerm>();

  constructor(
    private deps: {
      log: Logger;
      isOwner: (openId: string) => boolean;
      sender: () => PermCardSender | null;
      homeChatId: () => string;
      /** 裁决/超时后把对应审批卡更新成已决状态（去掉按钮）；失败不影响审批结果 */
      updateCard?: (requestId: string, state: "allow" | "deny" | "timeout") => void;
    },
  ) {}

  async request(
    requestId: string,
    toolName: string,
    input: unknown,
    ctx: PermCtx,
  ): Promise<{ behavior: "allow" | "deny"; message?: string }> {
    const chatId = ctx.chatId || this.deps.homeChatId();
    const sender = this.deps.sender();
    if (!chatId || !sender) {
      this.deps.log.warn(`权限请求 ${toolName} 无可用审批通道(chatId/transport 缺失)，默认拒绝`);
      return { behavior: "deny", message: "无审批通道" };
    }

    const inputPreview = JSON.stringify(input ?? {}, null, 0);
    const detail = [
      `会话：${ctx.nodeLabel ?? ctx.nodeId ?? "?"}`,
      `请求者：${ctx.senderName ?? ctx.senderId ?? "?"}`,
      `参数：${inputPreview.length > 360 ? inputPreview.slice(0, 360) + "…" : inputPreview}`,
    ].join("\n");

    const ok = await sender.sendCard(chatId, requestId, `🔐 工具审批：${toolName}`, detail).catch(() => false);
    if (!ok) {
      return { behavior: "deny", message: "审批卡片发送失败" };
    }
    this.deps.log.info(`审批卡片已发(${toolName}) → ${chatId}，等待主人…`);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        this.deps.updateCard?.(requestId, "timeout");
        resolve({ behavior: "deny", message: "审批超时(100s)" });
      }, 100_000);
      this.pending.set(requestId, { resolve, timer, toolName, ctx });
    });
  }

  /** 飞书卡片回调入口。返回给飞书的 toast 文案 */
  onCardAction(requestId: string, decision: "allow" | "deny", operatorOpenId: string): string {
    const p = this.pending.get(requestId);
    if (!p) return "该审批已处理或已超时";
    if (!this.deps.isOwner(operatorOpenId)) {
      this.deps.log.warn(`非主人 ${operatorOpenId.slice(0, 12)}… 试图操作审批卡片，已忽略`);
      return "只有主人可以审批此操作";
    }
    clearTimeout(p.timer);
    this.pending.delete(requestId);
    p.resolve(
      decision === "allow"
        ? { behavior: "allow" }
        : { behavior: "deny", message: "主人拒绝了该操作" },
    );
    this.deps.updateCard?.(requestId, decision);
    this.deps.log.info(`审批${decision === "allow" ? "✅通过" : "❌拒绝"}: ${p.toolName}`);
    return decision === "allow" ? "已允许 ✅" : "已拒绝";
  }
}
