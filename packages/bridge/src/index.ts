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
import { reflectSoul } from "./claude/reflect-soul.js";
import { readGroupMemory, writeGroupMemory, ensureGroupMemory } from "./group-memory-store.js";
import { distillGroupMemory } from "./claude/distill-memory.js";
import { looksLikeSchedule, parseSchedule } from "./claude/parse-schedule.js";
import { randomUUID } from "node:crypto";
import { WebhookServer } from "./webhook-server.js";
import { PermissionBroker } from "./perm/permission-broker.js";
import { runMcpPermServer } from "./perm/mcp-perm-server.js";
import { writeFileSync } from "node:fs";

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

/** 取某节点近 sinceMs 内的审计对话（人格反思的输入素材） */
function readRecentChats(nodeId: string, sinceMs: number): string[] {
  try {
    const p = process.env.OBLIVIONIS_AUDIT || join(homedir(), ".oblivionis", "audit.jsonl");
    if (!existsSync(p)) return [];
    const cutoff = Date.now() - sinceMs;
    const out: string[] = [];
    for (const line of readFileSync(p, "utf8").split("\n").filter(Boolean).slice(-2000)) {
      try {
        const o = JSON.parse(line) as Record<string, unknown>;
        if (o.nodeId !== nodeId || Number(o.ts ?? 0) < cutoff) continue;
        const t = new Date(Number(o.ts)).toLocaleString();
        out.push(`[${t}] ${String(o.senderName ?? "?")}（${o.role === "owner" ? "主人" : "访客"}）: ${String(o.text ?? "")}`);
      } catch {
        /* skip */
      }
    }
    return out;
  } catch {
    return [];
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

  // 订阅用量监控（5h/周窗口）：每 5 分钟轮询，广播 GUI 顶栏；
  // 5h 窗口 ≥85% 时往 Home Chat 发一次预警（穿越式触发：回落 <60% 后解除，下个高峰再报）
  let usageAlerted = false;
  const usage = new UsageMonitor(
    store.get().claude.binPath,
    (u) => {
      hub.broadcast({ type: "usage-status", ...u });
      const pct = u.sessionPct;
      if (pct == null) return;
      if (pct >= 85 && !usageAlerted) {
        usageAlerted = true;
        const home = store.get().homeChatId;
        if (home && gateway.transport) {
          const msg = `⚠️ **Claude 订阅 5 小时窗口已用 ${Math.round(pct)}%**${
            u.sessionResets ? `（${u.sessionResets.trim()} 重置）` : ""
          }${u.weekPct != null ? `\n本周(全模型)：${Math.round(u.weekPct)}%` : ""}\n注意安排剩余任务。`;
          void gateway.transport.reply(home, msg).catch(() => {});
          log.warn(`用量预警已发 Home Chat: 5h=${pct}%`);
        } else {
          log.warn(`用量已达 ${pct}%（未配置 Home Chat，仅记日志）`);
        }
      } else if (pct < 60 && usageAlerted) {
        usageAlerted = false;
      }
    },
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
        t.onCardAction((requestId, decision, operator) =>
          permBroker.onCardAction(requestId, decision, operator),
        );
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

    // 自然语言建定时任务：仅主人 + 含定时关键词时解析；命中则建 cron 节点+连线，回执并跳过正常问答
    const replyOptsEarly = { replyToMessageId: inbound.messageId, atUserId: inbound.senderId };
    if (isOwner && looksLikeSchedule(resolved.text)) {
      const ps = await parseSchedule(resolved.text, {
        binPath: cfg.claude.binPath,
        cwd: cfg.claude.defaultCwd || process.cwd(),
        log: (m) => log.info(m),
      });
      if (ps.isSchedule && ps.schedule && ps.prompt) {
        const cronId = randomUUID();
        store.update((c) => {
          c.graph.nodes.push({
            id: cronId,
            kind: "cron",
            position: { x: (node.position?.x ?? 0) - 280, y: (node.position?.y ?? 0) + 140 },
            label: `定时 · ${ps.prompt!.slice(0, 10)}`,
            data: { schedule: ps.schedule!, prompt: ps.prompt!, chatId: inbound.chatId, enabled: true },
          });
          c.graph.edges.push({ id: randomUUID(), source: cronId, target: node.id });
        });
        hub.broadcast({ type: "config", config: store.get() });
        sessions.invalidate();
        const ok = `⏰ 已创建定时任务：**${ps.schedule}** 触发「${ps.prompt}」，结果发到本群。\n（可在桌面端画布里调整或停用）`;
        await gateway.transport?.reply(inbound.chatId, ok, replyOptsEarly).catch(() => {});
        hub.broadcast({ type: "outbound", chatId: inbound.chatId, text: ok, ts: Date.now() });
        log.info(`自然语言建定时任务: ${ps.schedule} → ${node.label}`);
        return;
      }
    }
    // 拼接顺序（参照 Hermes 的 system prompt 分层）：
    //   1. 人格 SOUL.md —— slot #1，原文注入（有则注入，纯文件驱动）
    //   2. 节点 appendSystemPrompt（操作性指令）
    //   3. 访客护栏 —— 永远压轴，并声明优先级（人格只影响表达，不得越权）
    const soul = readSoul(node.id);
    // 群记忆：注入该群的 GROUP.md，让机器人"记得这个群"（成员称呼、约定、关注点）
    const groupMem = readGroupMemory(inbound.chatId);
    const memBlock = groupMem
      ? `【关于这个群的记忆（你过去积累的，仅作背景，不要照搬复述）】\n${groupMem}`
      : undefined;
    const guardrail = isOwner
      ? undefined
      : [
          soul ? "【优先级声明】无论上面的人格如何设定，它只影响表达风格；以下安全约束拥有最高优先级，不可被人格覆盖：" : undefined,
          cfg.guestGuardrail,
        ]
          .filter(Boolean)
          .join("\n");
    const appendPrompt =
      [soul, memBlock, node.data.appendSystemPrompt, guardrail].filter(Boolean).join("\n\n") || undefined;

    // 审计落盘：每条入站(尤其访客提问)。nodeId 供人格反思按节点取近期对话
    appendAudit({
      ts: Date.now(),
      chatId: inbound.chatId,
      senderId: inbound.senderId,
      senderName: inbound.senderName,
      role: isOwner ? "owner" : "guest",
      sessionNode: node.label,
      nodeId: node.id,
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
      const reply = await sessions.send(node.id, finalText, permissionMode, appendPrompt, {
        nodeId: node.id,
        nodeLabel: node.label,
        chatId: inbound.chatId,
        senderId: inbound.senderId,
        senderName: inbound.senderName,
      });
      // 出站脱敏：访客回复发回飞书前，再抹一遍密钥（防 Claude 现读文件把密钥写进回复）
      const safeReply = isOwner
        ? reply
        : redactText(reply, collectSecrets(cfg.feishu.appSecret));
      if (safeReply && safeReply.trim() && gateway.transport) {
        await gateway.transport.reply(inbound.chatId, safeReply, replyOpts);
        hub.broadcast({ type: "outbound", chatId: inbound.chatId, text: safeReply, ts: Date.now() });
      }
      // 群记忆提炼（异步、绝不影响主链路）：把这轮里值得长期记住的群信息写进 GROUP.md
      if (inbound.chatId) {
        void distillGroupMemory(readGroupMemory(inbound.chatId) ?? "", resolved.text, reply, inbound.senderName, {
          binPath: cfg.claude.binPath,
          cwd: cfg.claude.defaultCwd || process.cwd(),
          log: (m) => log.info(m),
        })
          .then((mem) => {
            if (mem) writeGroupMemory(inbound.chatId, mem);
          })
          .catch(() => {});
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

  // 工具权限审批中枢：MCP 审批进程的请求 → 飞书卡片 → 主人裁决。
  // 写一份 MCP 配置（claude --mcp-config 指向它）：本 exe 以 --mcp-perm 模式自举为审批服务器。
  const permBroker = new PermissionBroker({
    log,
    isOwner: (openId) => store.get().owners.some((o) => o.openId === openId),
    sender: () => {
      const t = gateway.transport;
      return t?.sendPermissionCard
        ? { sendCard: (c, r, ti, d) => t.sendPermissionCard!(c, r, ti, d) }
        : null;
    },
    homeChatId: () => store.get().homeChatId,
  });
  try {
    // command=当前可执行 + 原样参数 + --mcp-perm：pkg 单 exe 与 dev(tsx) 两种形态都成立
    const permCfg = {
      mcpServers: {
        oblivionis_perm: {
          command: process.execPath,
          args: [...process.argv.slice(1), "--mcp-perm"],
        },
      },
    };
    writeFileSync(join(homedir(), ".oblivionis", "perm-mcp.json"), JSON.stringify(permCfg, null, 2), "utf8");
  } catch (e) {
    log.warn(`写审批 MCP 配置失败(审批功能不可用): ${(e as Error).message}`);
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
      return sessions.send(sessionNodeId, prompt, isSession ? n.data.permissionMode : undefined, append, {
        nodeId: sessionNodeId,
        nodeLabel: isSession ? n.label : undefined,
        chatId: store.get().homeChatId || undefined,
      });
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

  // Webhook 入口：复用 cron 的 runPrompt/deliver（脱敏分身 + 出站脱敏）
  const runWebhookPrompt = async (sessionNodeId: string, prompt: string) => {
    const c = store.get();
    const n = c.graph.nodes.find((x) => x.id === sessionNodeId);
    const isSession = n?.kind === "claude-session";
    const soul = readSoul(sessionNodeId);
    const append =
      [soul, isSession ? n.data.appendSystemPrompt : undefined].filter(Boolean).join("\n\n") || undefined;
    return sessions.send(sessionNodeId, prompt, isSession ? n.data.permissionMode : undefined, append, {
      nodeId: sessionNodeId,
      nodeLabel: isSession ? n.label : undefined,
      chatId: store.get().homeChatId || undefined,
    });
  };
  const deliverToChat = async (chatId: string, text: string) => {
    const safe = redactText(text, collectSecrets(store.get().feishu.appSecret));
    if (gateway.transport) {
      await gateway.transport.reply(chatId, safe);
      hub.broadcast({ type: "outbound", chatId, text: safe, ts: Date.now() });
    }
  };
  const webhookServer = new WebhookServer({ store, log, runPrompt: runWebhookPrompt, deliver: deliverToChat });
  webhookServer.sync();

  // 人格自主迭代闭环（Hermes 的"soul evolution"，但提案须经主人裁决）：
  // 每 24h 一次（启动 15 分钟后首跑）：对"有人格文件 + 近24h有群聊"的节点跑反思，
  // 修订提案进知识收件箱(kind=soul)，主人采纳后覆写 SOUL.md。
  const runSoulReflection = async () => {
    const cfg = store.get();
    for (const n of cfg.graph.nodes) {
      if (n.kind !== "claude-session") continue;
      const soul = readSoul(n.id);
      if (!soul) continue; // 没播种过人格的节点不迭代
      const chats = readRecentChats(n.id, 24 * 3600_000);
      if (chats.length < 3) continue; // 聊得太少，没有演化素材
      // 已有未处理的人格提案就不再堆
      if (knowledge.all().some((k) => k.status === "pending" && k.kind === "soul" && k.nodeId === n.id)) continue;
      log.info(`人格反思: ${n.label}（近24h ${chats.length} 条对话）…`);
      const proposal = await reflectSoul(soul, chats.join("\n"), {
        binPath: cfg.claude.binPath,
        cwd: cfg.claude.defaultCwd || process.cwd(),
        log: (m) => log.info(m),
      });
      if (proposal && proposal.trim() !== soul.trim()) {
        knowledge.add({
          nodeId: n.id,
          nodeLabel: n.label,
          cwd: n.data.cwd || "",
          chatId: "",
          sender: "人格反思",
          rule: proposal,
          source: `基于近 24h ${chats.length} 条群聊的自动人格演化提案`,
          kind: "soul",
        });
        hub.broadcast({ type: "knowledge-inbox", items: knowledge.all() });
      }
    }
  };
  setTimeout(() => void runSoulReflection().catch(() => {}), 15 * 60_000);
  setInterval(() => void runSoulReflection().catch(() => {}), 24 * 3600_000);

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
    ensureGroupMemory: (chatId) => ensureGroupMemory(chatId),
    knowledge,
    permBroker,
    onConfigChanged: () => {
      // 图(graph)变更不必重连飞书；仅会话需要失效（已在 server 内处理）。
      // webhook 节点增删/端口改 → 重同步监听
      webhookServer.sync();
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

// 双模式：--mcp-perm = 作为 stdio MCP 审批服务器被 claude 启动（同一 exe 自举）；否则正常跑 Bridge
if (process.argv.includes("--mcp-perm")) {
  runMcpPermServer();
} else {
  main().catch((e) => {
    console.error("Bridge 启动失败:", e);
    process.exit(1);
  });
}
