import { randomUUID } from "node:crypto";
import type { ClaudeSessionNode } from "@oblivionis/shared";
import { ClaudeSession } from "./claude-session.js";
import { forkAndSanitize } from "./fork-prepare.js";
import { collectSecrets } from "../secrets.js";
import { feishuSecret } from "../secret-store.js";
import type { ConfigStore } from "../config-store.js";
import type { Hub } from "../hub.js";
import type { Logger } from "../logger.js";

/**
 * 管理所有 Claude 会话实例（按会话节点 id 索引）。
 * - 懒创建：首次给某节点发消息时才真正建实例。
 * - fork 模式：首次会从 baseSessionId fork 出访客会话并**脱敏**(抹掉密钥)，再持久化 sessionId。
 * - 所有 stream-json 事件 / 状态变化 经 Hub 广播给 GUI。
 */
export class SessionManager {
  private sessions = new Map<string, ClaudeSession>();
  /** 正在进行的首次 fork（按 nodeId 去重）：防并发首条消息各 spawn 一个 fork、互相覆盖 sessionId */
  private forkInFlight = new Map<string, Promise<void>>();

  constructor(
    private store: ConfigStore,
    private hub: Hub,
    private log: Logger,
    /** 一次运行完成时回报花费（成本看板记账用），可选 */
    private onCost?: (
      nodeId: string,
      label: string,
      rec: { cost: number; turns: number; durationMs: number; ctxTokens: number; outTokens: number; model?: string },
    ) => void,
  ) {}

  /**
   * 给某个会话节点发消息，返回最终回复文本。两会话模型（每个节点最多两条会话）：
   * - baseSessionId（开发会话）= **只属于软件里的终端**，飞书消息一律不碰它，避免污染你的开发上下文。
   * - 所有飞书消息（主人/访客一视同仁）都走 base **fork 出的脱敏分身**(sessionId)；首次自动 fork+脱敏。
   * - 没填 base 的节点：用单一 sessionId（主客共用）。
   * 主人/访客的差别只在 permissionMode / appendSystemPrompt(护栏) / 出站脱敏上（由调用方 index.ts 处理），不影响用哪条会话。
   */
  async send(
    nodeId: string,
    text: string,
    permissionMode?: string,
    appendSystemPrompt?: string,
    permCtx?: import("./claude-session.js").PermCtxLite,
    onText?: (acc: string) => void,
    extraEnv?: Record<string, string>,
  ): Promise<string> {
    const node = this.findNode(nodeId);
    if (!node) throw new Error(`未找到会话节点: ${nodeId}`);

    // 有 base：飞书走 fork 出的脱敏分身，绝不续接 base（base 留给终端）。首次先 fork+脱敏。
    if (node.data.baseSessionId) {
      // 「按群 fork」：每个群(chatId)各自一份独立分身，群间上下文互不污染。拿不到 chatId 时退回按会话。
      const chatId = permCtx?.chatId;
      if (node.data.forkScope === "group" && chatId) {
        const key = `${nodeId}::${chatId}`;
        if (!node.data.groupSessions?.[chatId]) {
          let inflight = this.forkInFlight.get(key);
          if (!inflight) {
            inflight = this.prepareGroupFork(nodeId, chatId).finally(() => this.forkInFlight.delete(key));
            this.forkInFlight.set(key, inflight);
          }
          await inflight;
        }
        const fresh = this.findNode(nodeId)!;
        const gsid = fresh.data.groupSessions?.[chatId];
        const session = this.ensureSession(fresh, key, gsid, (id) => this.persistGroupSessionId(nodeId, chatId, id));
        return session.send(text, permissionMode, appendSystemPrompt, permCtx, onText, extraEnv);
      }
      if (!node.data.sessionId) {
        // 并发去重：同节点多条首条消息只跑一次 fork，其余等同一个 Promise
        let inflight = this.forkInFlight.get(nodeId);
        if (!inflight) {
          inflight = this.prepareGuestFork(nodeId).finally(() => this.forkInFlight.delete(nodeId));
          this.forkInFlight.set(nodeId, inflight);
        }
        await inflight;
      }
      const fresh = this.findNode(nodeId)!; // sessionId 可能刚被 fork 写入
      const session = this.ensureSession(fresh, nodeId, fresh.data.sessionId, (id) =>
        this.persistSessionId(nodeId, id),
      );
      return session.send(text, permissionMode, appendSystemPrompt, permCtx, onText, extraEnv);
    }

    // 无 base：单一会话(sessionId)，主客共用（访客仅靠护栏限制）
    let sid = node.data.sessionId;
    if (!sid) {
      sid = randomUUID();
      this.persistSessionId(nodeId, sid);
    }
    const session = this.ensureSession(this.findNode(nodeId)!, nodeId, sid, (id) =>
      this.persistSessionId(nodeId, id),
    );
    return session.send(text, permissionMode, appendSystemPrompt, permCtx, onText, extraEnv);
  }

  /** 从 baseSessionId 重新 fork 出访客会话并脱敏，写回 sessionId（刷新快照 / 首次） */
  async prepareGuestFork(nodeId: string): Promise<void> {
    const node = this.findNode(nodeId);
    if (!node || !node.data.baseSessionId) {
      this.log.warn(`节点 ${nodeId} 未设基础会话(baseSessionId)，无法 fork`);
      return;
    }
    // 按群 fork 模式：刷新快照 = 清空所有群分身映射，各群下次来消息时各自重新 fork 一份新鲜的
    if (node.data.forkScope === "group") {
      this.clearGroupSessions(nodeId);
      for (const k of [...this.sessions.keys()]) if (k.startsWith(`${nodeId}::`)) this.sessions.delete(k);
      this.log.info(`节点 ${nodeId}: 已清空各群分身，下次各群重新 fork`);
      return;
    }
    const cfg = this.store.get();
    const cwd = node.data.cwd || cfg.claude.defaultCwd || process.cwd();
    this.log.info(`节点 ${nodeId}: 从 ${node.data.baseSessionId} fork 访客会话并脱敏…`);
    const forkId = await forkAndSanitize({
      baseSessionId: node.data.baseSessionId,
      cwd,
      binPath: cfg.claude.binPath,
      secrets: collectSecrets(feishuSecret.get()),
      log: (lvl, m) => this.log[lvl](m),
    });
    this.persistSessionId(nodeId, forkId);
    this.sessions.delete(nodeId); // 丢弃旧实例，下次用新 fork
    this.log.info(`节点 ${nodeId}: 访客会话已就绪 sessionId=${forkId}`);
  }

  /** 「按群 fork」：为某个群(chatId)从 baseSessionId fork 一份独立脱敏分身，写进 groupSessions[chatId] */
  async prepareGroupFork(nodeId: string, chatId: string): Promise<void> {
    const node = this.findNode(nodeId);
    if (!node || !node.data.baseSessionId) {
      this.log.warn(`节点 ${nodeId} 未设基础会话，无法按群 fork`);
      return;
    }
    const cfg = this.store.get();
    const cwd = node.data.cwd || cfg.claude.defaultCwd || process.cwd();
    this.log.info(`节点 ${nodeId} 群 ${chatId}: 从 ${node.data.baseSessionId} fork 独立分身并脱敏…`);
    const forkId = await forkAndSanitize({
      baseSessionId: node.data.baseSessionId,
      cwd,
      binPath: cfg.claude.binPath,
      secrets: collectSecrets(feishuSecret.get()),
      log: (lvl, m) => this.log[lvl](m),
    });
    this.persistGroupSessionId(nodeId, chatId, forkId);
    this.sessions.delete(`${nodeId}::${chatId}`);
    this.log.info(`节点 ${nodeId} 群 ${chatId}: 独立分身就绪 sessionId=${forkId}`);
  }

  /**
   * 按 key(=nodeId) 懒创建/复用一个 ClaudeSession 实例。飞书侧每个节点只有一条会话(fork 分身或无 base 的单会话)。
   * 已显式给定 sessionId 时不会触发 ClaudeSession 内部的 fork 分支。
   */
  private ensureSession(
    node: ClaudeSessionNode,
    key: string,
    sessionId: string | undefined,
    persist: (id: string) => void,
  ): ClaudeSession {
    const existing = this.sessions.get(key);
    if (existing) return existing;

    const cfg = this.store.get();
    let sid = sessionId;
    const session = new ClaudeSession({
      nodeId: node.id,
      label: node.label,
      sessionId: sid,
      // 已显式给定 sessionId 时不会触发 fork 分支；为安全起见 owner/guest 路径不传 base
      baseSessionId: sid ? undefined : node.data.baseSessionId,
      binPath: cfg.claude.binPath,
      cwd: node.data.cwd || cfg.claude.defaultCwd || process.cwd(),
      model: node.data.model,
      permissionMode: node.data.permissionMode,
      appendSystemPrompt: node.data.appendSystemPrompt,
      includePartialMessages: node.data.includePartialMessages,
      extraArgs: node.data.extraArgs,
      approval: node.data.approvalMode,
      wsPort: cfg.bridge.wsPort,
      onEvent: (event) => this.hub.broadcast({ type: "session-event", nodeId: node.id, sessionId: sid ?? "", event }),
      onStatus: (status) => this.hub.broadcast({ type: "session-status", nodeId: node.id, sessionId: sid ?? "", status }),
      onSessionId: (id) => {
        sid = id;
        persist(id);
      },
      onCost: (rec) => this.onCost?.(node.id, node.label, rec),
      log: (level, msg) => this.log[level](msg),
    });
    this.sessions.set(key, session);
    this.log.info(`会话就绪 node=${node.id} key=${key} sessionId=${sid} cwd=${node.data.cwd}`);
    return session;
  }

  private findNode(nodeId: string): ClaudeSessionNode | undefined {
    const n = this.store.get().graph.nodes.find((x) => x.id === nodeId);
    return n && n.kind === "claude-session" ? n : undefined;
  }

  private persistSessionId(nodeId: string, id: string): void {
    const cur = this.findNode(nodeId)?.data.sessionId;
    if (cur === id) return; // 没变就不写、不广播，避免配置抖动
    this.store.update((cfg) => {
      const target = cfg.graph.nodes.find((x) => x.id === nodeId);
      if (target && target.kind === "claude-session") target.data.sessionId = id;
    });
    this.hub.broadcast({ type: "config", config: this.store.get() });
  }

  /** 按群 fork：把某群的 fork id 写进 groupSessions[chatId] */
  private persistGroupSessionId(nodeId: string, chatId: string, id: string): void {
    const cur = this.findNode(nodeId)?.data.groupSessions?.[chatId];
    if (cur === id) return;
    this.store.update((cfg) => {
      const target = cfg.graph.nodes.find((x) => x.id === nodeId);
      if (target && target.kind === "claude-session") {
        target.data.groupSessions = { ...(target.data.groupSessions ?? {}), [chatId]: id };
      }
    });
    this.hub.broadcast({ type: "config", config: this.store.get() });
  }

  /** 清空某节点的所有群分身映射（按群 fork 模式下「刷新快照」用） */
  private clearGroupSessions(nodeId: string): void {
    if (!this.findNode(nodeId)?.data.groupSessions) return;
    this.store.update((cfg) => {
      const target = cfg.graph.nodes.find((x) => x.id === nodeId);
      if (target && target.kind === "claude-session") target.data.groupSessions = {};
    });
    this.hub.broadcast({ type: "config", config: this.store.get() });
  }

  /**
   * 中断某会话节点正在进行的运行（杀掉在跑的 claude 子进程）。用于循环「强制中断」。
   * 同时覆盖单分身(key=nodeId)与按群分身(key=nodeId::chatId)。与空闲看门狗同一杀进程机制，安全。
   */
  interrupt(nodeId: string): void {
    this.sessions.get(nodeId)?.interrupt();
    for (const [k, s] of this.sessions) if (k.startsWith(`${nodeId}::`)) s.interrupt();
  }

  /** 配置变更后调用：丢弃已变更节点的实例，下次发消息重建 */
  invalidate(): void {
    this.sessions.clear();
  }
}
