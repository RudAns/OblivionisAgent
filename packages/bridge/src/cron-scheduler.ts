import type { ConfigStore } from "./config-store.js";
import type { Logger } from "./logger.js";
import type { CronNode, ClaudeSessionNode } from "@oblivionis/shared";

/**
 * 定时任务调度器（vision-agentic-roadmap.md §4 L2）：
 * 每 30s tick 一次，遍历画布上的「定时」节点；到点时沿连线找到下游「Claude 会话」节点，
 * 把 prompt 当成一条普通消息发给它（= 跑在脱敏分身上，权限/护栏/人格与飞书消息一致），
 * 结果发到节点指定群或全局 homeChatId。
 *
 * 安全栅栏（照抄 Hermes 的教训）：
 * - 每次触发 = 普通会话消息，无任何特权；
 * - 定时会话内不暴露"创建定时任务"的能力（本来也没有）→ 不会自我增殖；
 * - 同一节点上一次还在跑则跳过本次（防堆积）。
 *
 * schedule 语法（v1）：
 * - "HH:MM"        每天该时刻（本机时区）
 * - "every 30m" / "every 2h"   间隔触发
 */
export interface CronDeps {
  store: ConfigStore;
  log: Logger;
  /** 跑一次任务：对目标会话节点发 prompt，返回回复文本 */
  runPrompt: (sessionNodeId: string, prompt: string) => Promise<string>;
  /** 把结果发到飞书群（chatId 为空则不发） */
  deliver: (chatId: string, text: string) => Promise<void>;
}

interface CronState {
  lastFired: number; // ms
  running: boolean;
  startedAt: number; // ms，本次运行开始时刻（看门狗用）
}

/** 单次运行超过此时长仍未结束 → 判为卡死，强制复位 running，让该 cron 能再次触发。 */
const MAX_RUN_MS = 10 * 60_000;
/** 同一 tick 多个定时到点时，相邻两个错开的基础间隔（避免同秒齐发撞飞书限频）。 */
const STAGGER_MS = 4_000;

export class CronScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private state = new Map<string, CronState>();

  constructor(private deps: CronDeps) {}

  start(): void {
    this.timer = setInterval(() => this.tick(), 30_000);
    this.deps.log.info("定时任务调度器已启动 (30s tick)");
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const cfg = this.deps.store.get();
    const now = new Date();
    const due: { cron: CronNode; session: ClaudeSessionNode; st: CronState }[] = [];

    for (const node of cfg.graph.nodes) {
      if (node.kind !== "cron") continue;
      const cron = node as CronNode;
      if (!cron.data.enabled || !cron.data.prompt.trim()) continue;
      let st = this.state.get(node.id);
      if (!st) {
        // 首次见到该 cron：种 lastFired=now，让 "every Nm" 满一个间隔再触发(避免启动即触发)。
        st = { lastFired: now.getTime(), running: false, startedAt: 0 };
        this.state.set(node.id, st);
      }
      // 看门狗：上次运行跑太久(claude 卡死/挂起、promise 永不 settle)→ 强制复位，
      // 否则 running 永远停在 true，该 cron 再也不触发（报告里标记的"卡死"根因）。
      if (st.running) {
        if (st.startedAt && now.getTime() - st.startedAt > MAX_RUN_MS) {
          this.deps.log.warn(
            `定时任务「${node.label}」运行超过 ${Math.round(MAX_RUN_MS / 60_000)} 分钟未结束，强制复位（疑似卡死；旧进程可能成孤儿）`,
          );
          st.running = false;
        } else {
          continue;
        }
      }
      if (!shouldFire(cron.data.schedule, now, st.lastFired)) continue;

      // 沿连线找下游 Claude 会话节点
      const targetIds = cfg.graph.edges.filter((e) => e.source === node.id).map((e) => e.target);
      const session = cfg.graph.nodes.find(
        (n): n is ClaudeSessionNode => n.kind === "claude-session" && targetIds.includes(n.id),
      );
      if (!session) {
        this.deps.log.warn(`定时节点「${node.label}」没有连接到任何 Claude 会话，跳过`);
        st.lastFired = now.getTime();
        continue;
      }
      due.push({ cron, session, st });
    }

    // 抖动/错峰：同一 tick 多个到点 → 按序错开启动（基础间隔 + 小随机），避免同秒齐发把飞书撞限频。
    due.forEach((item, i) => {
      const delay = i === 0 ? 0 : i * STAGGER_MS + Math.floor(Math.random() * 1500);
      item.st.running = true;
      item.st.startedAt = now.getTime() + delay;
      item.st.lastFired = now.getTime();
      setTimeout(() => this.fire(item.cron, item.session), delay);
    });
  }

  /** 实际跑一次定时任务并投递结果；finally 里复位 running（防卡死的兜底仍是 tick 里的看门狗）。 */
  private fire(cron: CronNode, session: ClaudeSessionNode): void {
    const cur = this.state.get(cron.id);
    if (cur) cur.startedAt = Date.now();
    this.deps.log.info(`定时任务触发:「${cron.label}」→ ${session.label}`);
    void this.deps
      .runPrompt(session.id, cron.data.prompt)
      .then(async (reply) => {
        const cfg = this.deps.store.get();
        const chatId = cron.data.chatId || cfg.homeChatId;
        if (chatId && reply.trim()) {
          await this.deps.deliver(chatId, `⏰ 「${cron.label}」\n\n${reply}`);
        } else if (reply.trim()) {
          this.deps.log.info(`定时任务「${cron.label}」完成(未配置投递群): ${reply.slice(0, 200)}`);
        }
      })
      .catch((e) => this.deps.log.error(`定时任务「${cron.label}」失败: ${(e as Error).message}`))
      .finally(() => {
        const s = this.state.get(cron.id);
        if (s) s.running = false;
      });
  }
}

/** 判断 schedule 在 now 是否应触发（结合上次触发时间防重复/防漏） */
export function shouldFire(schedule: string, now: Date, lastFired: number): boolean {
  const s = schedule.trim().toLowerCase();

  // every Nm / every Nh
  const every = /^every\s+(\d+)\s*(m|h)$/.exec(s);
  if (every) {
    const n = Number(every[1]);
    if (!n) return false;
    const intervalMs = n * (every[2] === "h" ? 3600_000 : 60_000);
    return now.getTime() - lastFired >= intervalMs;
  }

  // HH:MM 每天：目标时刻已到、且今天这个点之后还没触发过 → 触发。
  // 用"目标时刻已过 + 今天未触发"而非"恰好落在这一分钟"：漏过该分钟的 tick 也能补触发，且不重复、不受 DST 影响。
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h > 23 || m > 59) return false;
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (now.getTime() < target.getTime()) return false; // 今天还没到点
    return lastFired < target.getTime(); // 今天这个点之后没触发过
  }

  return false;
}
