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
}

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
    for (const node of cfg.graph.nodes) {
      if (node.kind !== "cron") continue;
      const cron = node as CronNode;
      if (!cron.data.enabled || !cron.data.prompt.trim()) continue;
      const st = this.state.get(node.id) ?? { lastFired: 0, running: false };
      if (st.running) continue;
      if (!shouldFire(cron.data.schedule, now, st.lastFired)) continue;

      // 沿连线找下游 Claude 会话节点
      const targetIds = cfg.graph.edges.filter((e) => e.source === node.id).map((e) => e.target);
      const session = cfg.graph.nodes.find(
        (n): n is ClaudeSessionNode => n.kind === "claude-session" && targetIds.includes(n.id),
      );
      if (!session) {
        this.deps.log.warn(`定时节点「${node.label}」没有连接到任何 Claude 会话，跳过`);
        st.lastFired = now.getTime();
        this.state.set(node.id, st);
        continue;
      }

      st.running = true;
      st.lastFired = now.getTime();
      this.state.set(node.id, st);
      this.deps.log.info(`定时任务触发:「${node.label}」→ ${session.label}`);

      void this.deps
        .runPrompt(session.id, cron.data.prompt)
        .then(async (reply) => {
          const chatId = cron.data.chatId || cfg.homeChatId;
          if (chatId && reply.trim()) {
            await this.deps.deliver(chatId, `⏰ 「${node.label}」\n\n${reply}`);
          } else if (reply.trim()) {
            this.deps.log.info(`定时任务「${node.label}」完成(未配置投递群): ${reply.slice(0, 200)}`);
          }
        })
        .catch((e) => this.deps.log.error(`定时任务「${node.label}」失败: ${(e as Error).message}`))
        .finally(() => {
          const cur = this.state.get(node.id);
          if (cur) cur.running = false;
        });
    }
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

  // HH:MM 每天（tick 30s 一次，落在该分钟内且本分钟没触发过）
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h > 23 || m > 59) return false;
    if (now.getHours() !== h || now.getMinutes() !== m) return false;
    return now.getTime() - lastFired > 90_000; // 同一分钟内不重复
  }

  return false;
}
