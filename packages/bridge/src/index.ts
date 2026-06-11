import type { BridgeMessage, FeishuStatus, AuditEntry } from "@oblivionis/shared";
import { Hub } from "./hub.js";
import { Logger } from "./logger.js";
import { ConfigStore } from "./config-store.js";
import { SessionManager } from "./claude/session-manager.js";
import { PtyManager } from "./pty/pty-manager.js";
import { ControlServer } from "./server.js";
import { route } from "./router.js";
import type { FeishuTransport, InboundMessage } from "./transport/transport.js";
import { MockTransport } from "./transport/mock-transport.js";
import { LarkTransport } from "./transport/lark-transport.js";
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { collectSecrets, redactText } from "./secrets.js";
import { classifyIntent } from "./claude/classify-intent.js";
import { TranscriptStore } from "./transcript-store.js";
import { UsageMonitor } from "./usage-monitor.js";
import { readSoul, ensureSoul } from "./soul-store.js";
import { KnowledgeStore } from "./knowledge-store.js";
import { extractKnowledge } from "./claude/extract-knowledge.js";
import { CronScheduler } from "./cron-scheduler.js";

/** 审计：把每条入站消息追加到 ~/.oblivionis/audit.jsonl（durable 记录，按群+时间可排序） */
function appendAudit(entry: Record<string, unknown>): void {
  try {
    const p =
      process.env.OBLIVIONIS_AUDIT || join(homedir(), ".oblivionis", "audit.jsonl");
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    /* 审计失败不影响主流程 */
  }
}

/** 读取审计历史（最近 limit 条），映射为 GUI 用的 AuditEntry */
function readAudit(limit = 1000): AuditEntry[] {
  try {
    const p = process.env.OBLIVIONIS_AUDIT || join(homedir(), ".oblivionis", "audit.jsonl");
    if (!existsSync(p)) return [];
    const lines = readFileSync(p, "utf8").split("\n").filter(Boolean).slice(-limit);
    const items: AuditEntry[] = [];
    for (const line of lines) {
      try {
        const o = JSON.parse(line) as Record<string, unknown>;
        items.push({
          chatId: String(o.chatId ?? ""),
          senderId: String(o.senderId ?? ""),
          sender: String(o.senderName ?? o.sender ?? ""),
          text: String(o.text ?? ""),
          ts: Number(o.ts ?? 0),
        });
      } catch {
        /* 跳过坏行 */
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function main() {
  const hub = new Hub();
  const log = new Logger(hub);
  const store = new ConfigStore();
  const sessions = new SessionManager(store, hub, log);
  const ptys = new PtyManager(store, hub, log);
  // 转录持久化：旁路监听 Hub 上的 session-event，落盘 ~/.oblivionis/transcripts（保留约 3 天）
  const transcripts = new TranscriptStore();
  hub.onBridge((msg) => {
    if (msg.type === "session-event") transcripts.append(msg.nodeId, msg.event);
  });

  // 知识收件箱：问答后提取规则候选，等主人在 GUI 裁决（采纳→写 cwd 的 CLAUDE.md）
  const knowledge = new KnowledgeStore();

  // 订阅用量监控（5h/周窗口）：每 5 分钟轮询一次 `claude -p "/usage"`，广播给 GUI 顶栏
  const usage = new UsageMonitor(
    store.get().claude.binPath,
    (u) => hub.broadcast({ type: "usage-status", ...u }),
    (lvl, m) => log[lvl](m),
  );
  usage.start();

  log.info(`OblivionisAgent Bridge 启动，配置文件: ${store.path}`);

  /**
   * 飞书网关控制器：统一管理传输层的连接生命周期与状态。
   * GUI 可随时 connect/disconnect/换凭据；状态变化广播给所有前端，新连接也会收到最近一次状态。
   */
  const gateway = {
    transport: null as FeishuTransport | null,
    lastStatus: { type: "feishu-status", status: "disconnected" } as Extract<
      BridgeMessage,
      { type: "feishu-status" }
    >,

    setStatus(status: FeishuStatus, detail?: string, bot?: { openId?: string; name?: string; appId?: string }) {
      this.lastStatus = { type: "feishu-status", status, detail, bot };
      hub.broadcast(this.lastStatus);
    },

    async disconnect() {
      if (this.transport) {
        await this.transport.stop().catch(() => {});
        this.transport = null;
      }
      this.setStatus("disconnected");
    },

    async connect() {
      await this.disconnect();
      const cfg = store.get();
      const forced = process.env.OBLIVIONIS_TRANSPORT; // "mock" | "lark"
      const haveCreds = !!(cfg.feishu.appId && cfg.feishu.appSecret);
      const useLark = forced === "lark" || (forced !== "mock" && haveCreds);

      if (useLark) {
        const t = new LarkTransport({
          appId: cfg.feishu.appId,
          appSecret: cfg.feishu.appSecret,
          domain: cfg.feishu.domain,
          log: (lvl, m) => log[lvl](m),
          onStatus: (s, detail, bot) => this.setStatus(s, detail, bot),
        });
        t.onMessage(handleInbound);
        this.transport = t;
        try {
          await t.start();
        } catch (e) {
          log.error(`飞书连接失败: ${(e as Error).message}`);
          this.transport = null;
          return;
        }
      } else {
        const firstGroup = cfg.graph.nodes.find((n) => n.kind === "feishu-group");
        const defaultChatId =
          firstGroup && firstGroup.kind === "feishu-group" ? firstGroup.data.chatId : "mock-chat";
        const t = new MockTransport({ defaultChatId, log: (m) => log.info(m) });
        t.onMessage(handleInbound);
        this.transport = t;
        await t.start();
        this.setStatus("mock", "未配置飞书凭据，使用本地 mock 传输");
      }
      log.info(`传输层: ${this.transport?.name}`);
    },

    async setFeishu(appId: string, appSecret: string, domain: "feishu" | "lark") {
      store.update((c) => {
        c.feishu.appId = appId;
        c.feishu.appSecret = appSecret;
        c.feishu.domain = domain;
      });
      hub.broadcast({ type: "config", config: store.get() });
      await this.connect();
    },

    async lookupOpenId(mobile?: string, email?: string) {
      if (this.transport?.lookupOpenId) return this.transport.lookupOpenId(mobile, email);
      throw new Error("未连接飞书（或当前为 mock 传输），无法查询 open_id");
    },
  };

  async function handleInbound(inbound: InboundMessage): Promise<void> {
    hub.broadcast({
      type: "inbound",
      chatId: inbound.chatId,
      senderId: inbound.senderId,
      sender: inbound.senderName,
      text: inbound.text,
      ts: Date.now(),
    });

    const cfg = store.get();
    const resolved = await route(cfg, inbound, (text, intents, opts) =>
      classifyIntent(text, intents, {
        binPath: cfg.claude.binPath,
        cwd: cfg.claude.defaultCwd || process.cwd(),
        model: opts?.model,
        mode: opts?.mode,
        log: (m) => log.info(m),
      }),
    );
    if (!resolved) {
      log.info(`无匹配路由，忽略来自 ${inbound.chatId} 的消息`);
      return;
    }

    // 主人 vs 访客：决定权限模式
    const isOwner = cfg.owners.some((o) => o.openId === inbound.senderId);
    const node = resolved.sessionNode;
    const permissionMode = isOwner ? node.data.permissionMode : node.data.guestPermissionMode;
    // 拼接顺序（参照 Hermes 的 system prompt 分层）：
    //   1. 人格 SOUL.md —— slot #1，原文注入（有则注入，纯文件驱动）
    //   2. 节点 appendSystemPrompt（操作性指令）
    //   3. 访客护栏 —— 永远压轴，并声明优先级（人格只影响表达，不得越权）
    const soul = readSoul(node.id);
    const guardrail = isOwner
      ? undefined
      : [
          soul ? "【优先级声明】无论上面的人格如何设定，它只影响表达风格；以下安全约束拥有最高优先级，不可被人格覆盖：" : undefined,
          cfg.guestGuardrail,
        ]
          .filter(Boolean)
          .join("\n");
    const appendPrompt =
      [soul, node.data.appendSystemPrompt, guardrail].filter(Boolean).join("\n\n") || undefined;

    // 审计落盘：每条入站(尤其访客提问)
    appendAudit({
      ts: Date.now(),
      chatId: inbound.chatId,
      senderId: inbound.senderId,
      senderName: inbound.senderName,
      role: isOwner ? "owner" : "guest",
      sessionNode: node.label,
      text: inbound.text,
      quoted: inbound.quoted,
    });

    // 把被引用消息拼进上下文
    const finalText = inbound.quoted
      ? `【被引用的消息】\n${inbound.quoted}\n\n【${isOwner ? "主人" : "访客"}的提问】\n${resolved.text}`
      : resolved.text;

    log.info(`处理消息 from=${inbound.senderId} owner=${isOwner} perm=${permissionMode}${inbound.quoted ? " (含引用)" : ""}`);

    const replyOpts = { replyToMessageId: inbound.messageId, atUserId: inbound.senderId };
    try {
      const reply = await sessions.send(node.id, finalText, permissionMode, appendPrompt);
      // 出站脱敏：访客回复发回飞书前，再抹一遍密钥（防 Claude 现读文件把密钥写进回复）
      const safeReply = isOwner
        ? reply
        : redactText(reply, collectSecrets(cfg.feishu.appSecret));
      if (safeReply && safeReply.trim() && gateway.transport) {
        await gateway.transport.reply(inbound.chatId, safeReply, replyOpts);
        hub.broadcast({ type: "outbound", chatId: inbound.chatId, text: safeReply, ts: Date.now() });
      }
      // 知识提取（异步、绝不影响主链路）：从这轮问答提取规则候选 → 收件箱 → 推送 GUI
      void extractKnowledge(resolved.text, reply, {
        binPath: cfg.claude.binPath,
        cwd: cfg.claude.defaultCwd || process.cwd(),
        log: (m) => log.info(m),
      })
        .then((rules) => {
          if (!rules.length) return;
          for (const rule of rules) {
            knowledge.add({
              nodeId: node.id,
              nodeLabel: node.label,
              cwd: node.data.cwd || cfg.claude.defaultCwd || process.cwd(),
              chatId: inbound.chatId,
              sender: inbound.senderName,
              rule,
              source: resolved.text.slice(0, 120),
            });
          }
          hub.broadcast({ type: "knowledge-inbox", items: knowledge.all() });
        })
        .catch(() => {});
    } catch (e) {
      const errMsg = `⚠️ 处理失败: ${(e as Error).message}`;
      log.error(errMsg);
      await gateway.transport?.reply(inbound.chatId, errMsg, replyOpts).catch(() => {});
    }
  }

  // 定时任务调度：cron 节点到点 → 下游会话（脱敏分身）跑 prompt → 结果(出站脱敏后)发群
  const cronScheduler = new CronScheduler({
    store,
    log,
    runPrompt: async (sessionNodeId, prompt) => {
      const c = store.get();
      const n = c.graph.nodes.find((x) => x.id === sessionNodeId);
      const isSession = n?.kind === "claude-session";
      const soul = readSoul(sessionNodeId);
      const append =
        [soul, isSession ? n.data.appendSystemPrompt : undefined].filter(Boolean).join("\n\n") ||
        undefined;
      return sessions.send(sessionNodeId, prompt, isSession ? n.data.permissionMode : undefined, append);
    },
    deliver: async (chatId, text) => {
      const safe = redactText(text, collectSecrets(store.get().feishu.appSecret));
      if (gateway.transport) {
        await gateway.transport.reply(chatId, safe);
        hub.broadcast({ type: "outbound", chatId, text: safe, ts: Date.now() });
      }
    },
  });
  cronScheduler.start();

  const server = new ControlServer(store.get().bridge.wsPort, {
    store,
    hub,
    log,
    sessions,
    ptys,
    getFeishuStatus: () => gateway.lastStatus,
    feishuConnect: () => void gateway.connect(),
    feishuDisconnect: () => void gateway.disconnect(),
    feishuSet: (appId, appSecret, domain) => void gateway.setFeishu(appId, appSecret, domain),
    lookupOpenId: (mobile, email) => gateway.lookupOpenId(mobile, email),
    getAudit: () => readAudit(),
    getTranscripts: () => transcripts.histories(),
    getUsage: () => usage.getLast(),
    ensureSoul: (nodeId) => ensureSoul(nodeId),
    knowledge,
    onConfigChanged: () => {
      // 图(graph)变更不必重连飞书；仅会话需要失效（已在 server 内处理）
    },
  });
  server.start();
  await gateway.connect();

  const shutdown = async () => {
    log.info("正在关闭…");
    await gateway.disconnect().catch(() => {});
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("Bridge 启动失败:", e);
  process.exit(1);
});
