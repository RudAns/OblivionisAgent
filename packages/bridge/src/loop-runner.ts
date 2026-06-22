import type { ConfigStore } from "./config-store.js";
import type { Logger } from "./logger.js";
import type { LoopNode, ClaudeSessionNode } from "@oblivionis/shared";
import { shouldFire } from "./cron-scheduler.js";

/**
 * 循环调度器（Loop Engineering 驱动器 / cron 升级版）：
 * 触发后对下游「Claude 会话」节点**反复**跑 prompt——第 1 轮发 `prompt`，之后每轮发 `continuePrompt`
 * 回灌进同一脱敏分身（上下文自然累积），直到：命中完成标记 / 跑满 maxRounds / 超 maxCostUsd 才停，
 * 最后把各轮产出汇总发到群。
 *
 * 安全栅栏（同 cron）：每轮 = 普通脱敏分身上的一条消息，无任何特权；破坏性操作仍走审批卡。
 * 刹车：maxRounds 永远兜底（防失控空转）；sentinel 完成标记可提前停；maxCostUsd>0 时按累计花费停。
 * - schedule 非空 → 到点自动触发（语法同 cron，复用 shouldFire）；schedule 空 → 仅手动 runNow。
 * - 同一节点上一轮还在跑则跳过（防堆积）；看门狗复位卡死。
 */
export interface LoopDeps {
  store: ConfigStore;
  log: Logger;
  /** 跑一次：对目标会话节点发 prompt，返回回复文本（复用 cron/webhook 的同一实现：脱敏分身） */
  runPrompt: (sessionNodeId: string, prompt: string) => Promise<string>;
  /** 把结果发到飞书群（出站脱敏由实现保证） */
  deliver: (chatId: string, text: string) => Promise<void>;
  /** 广播运行进度给 GUI（节点卡/检视显示第几轮、是否在跑、停因） */
  progress: (nodeId: string, round: number, max: number, running: boolean, note?: string) => void;
  /** 当前累计花费 USD（用于预算刹车；取自成本账本 summary().total） */
  costTotal: () => number;
}

interface LoopState {
  lastFired: number;
  running: boolean;
  startedAt: number;
}

/** 循环可能多轮、较久，给宽一点；看门狗兜底防卡死后再也不触发。 */
const MAX_RUN_MS = 30 * 60_000;
/** 轮间小憩，避免连发撞飞书限频。 */
const ROUND_GAP_MS = 1500;

export class LoopRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private state = new Map<string, LoopState>();

  constructor(private deps: LoopDeps) {}

  start(): void {
    this.timer = setInterval(() => this.tick(), 30_000);
    this.deps.log.info("循环调度器已启动 (30s tick)");
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** 手动「跑一次」：忽略 schedule 立即触发（仍受 running 守卫 + 各刹车）。 */
  runNow(nodeId: string): void {
    const cfg = this.deps.store.get();
    const node = cfg.graph.nodes.find((n) => n.id === nodeId && n.kind === "loop") as LoopNode | undefined;
    if (!node) {
      this.deps.log.warn(`run-loop: 找不到循环节点 ${nodeId}`);
      return;
    }
    const session = this.downstream(cfg, nodeId);
    if (!session) {
      this.deps.log.warn(`循环节点「${node.label}」没连到任何 Claude 会话，跳过`);
      this.deps.progress(nodeId, 0, node.data.maxRounds, false, "没连到会话");
      return;
    }
    let st = this.state.get(nodeId);
    if (!st) {
      st = { lastFired: 0, running: false, startedAt: 0 };
      this.state.set(nodeId, st);
    }
    if (st.running) {
      this.deps.log.warn(`循环「${node.label}」上一轮还在跑，忽略本次手动触发`);
      return;
    }
    st.running = true;
    st.startedAt = Date.now();
    st.lastFired = Date.now();
    void this.fire(node, session);
  }

  private downstream(
    cfg: ReturnType<ConfigStore["get"]>,
    loopId: string,
  ): ClaudeSessionNode | undefined {
    const targetIds = cfg.graph.edges.filter((e) => e.source === loopId).map((e) => e.target);
    return cfg.graph.nodes.find(
      (n): n is ClaudeSessionNode => n.kind === "claude-session" && targetIds.includes(n.id),
    );
  }

  private tick(): void {
    const cfg = this.deps.store.get();
    const now = Date.now();
    for (const node of cfg.graph.nodes) {
      if (node.kind !== "loop") continue;
      const loop = node as LoopNode;
      if (!loop.data.enabled || !loop.data.schedule.trim() || !loop.data.prompt.trim()) continue;
      let st = this.state.get(node.id);
      if (!st) {
        st = { lastFired: now, running: false, startedAt: 0 };
        this.state.set(node.id, st);
      }
      if (st.running) {
        if (st.startedAt && now - st.startedAt > MAX_RUN_MS) {
          this.deps.log.warn(`循环「${node.label}」超过 ${Math.round(MAX_RUN_MS / 60_000)} 分钟未结束，强制复位（疑似卡死）`);
          st.running = false;
        } else {
          continue;
        }
      }
      if (!shouldFire(loop.data.schedule, new Date(now), st.lastFired)) continue;
      const session = this.downstream(cfg, node.id);
      if (!session) {
        this.deps.log.warn(`循环节点「${node.label}」没连到任何 Claude 会话，跳过`);
        st.lastFired = now;
        continue;
      }
      st.running = true;
      st.startedAt = now;
      st.lastFired = now;
      void this.fire(loop, session);
    }
  }

  /** 实际跑一次循环（多轮）；finally 复位 running。 */
  private async fire(loop: LoopNode, session: ClaudeSessionNode): Promise<void> {
    const d = loop.data;
    const maxRounds = Math.max(1, Math.min(50, d.maxRounds || 5));
    const startCost = this.deps.costTotal();
    const transcript: string[] = [];
    let stopReason = `跑满 ${maxRounds} 轮`;
    let round = 0;
    this.deps.log.info(`循环触发:「${loop.label}」→ ${session.label}（上限 ${maxRounds} 轮）`);
    try {
      for (round = 1; round <= maxRounds; round++) {
        this.deps.progress(loop.id, round, maxRounds, true);
        const prompt = round === 1 ? d.prompt || "开始。" : d.continuePrompt;
        const reply = (await this.deps.runPrompt(session.id, prompt)) ?? "";
        transcript.push(`【第 ${round} 轮】\n${reply.trim()}`);

        if (d.stopMode === "sentinel" && d.doneMarker && reply.includes(d.doneMarker)) {
          stopReason = `命中完成标记（第 ${round} 轮）`;
          break;
        }
        if (d.maxCostUsd > 0 && this.deps.costTotal() - startCost >= d.maxCostUsd) {
          stopReason = `达预算上限 $${d.maxCostUsd}（第 ${round} 轮）`;
          break;
        }
        if (round < maxRounds) await new Promise((r) => setTimeout(r, ROUND_GAP_MS));
      }
      if (round > maxRounds) round = maxRounds;

      const cfg = this.deps.store.get();
      const chatId = d.chatId || cfg.homeChatId;
      const spent = this.deps.costTotal() - startCost;
      const head =
        `🔁「${loop.label}」循环完成 · ${round} 轮 · 停因：${stopReason}` +
        (spent > 0 ? ` · 花费 $${spent.toFixed(3)}` : "");
      const body = transcript.join("\n\n");
      if (chatId && body.trim()) {
        await this.deps.deliver(chatId, `${head}\n\n${body}`);
      } else {
        this.deps.log.info(`循环「${loop.label}」完成(未配置投递群): ${round} 轮，${stopReason}`);
      }
      this.deps.progress(loop.id, round, maxRounds, false, stopReason);
    } catch (e) {
      this.deps.log.error(`循环「${loop.label}」失败: ${(e as Error).message}`);
      this.deps.progress(loop.id, round, maxRounds, false, `失败：${(e as Error).message}`);
    } finally {
      const s = this.state.get(loop.id);
      if (s) s.running = false;
    }
  }
}
