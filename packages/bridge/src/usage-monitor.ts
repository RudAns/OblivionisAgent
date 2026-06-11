import spawn from "cross-spawn";
import type { UsageSnapshot } from "@oblivionis/shared";

/**
 * 订阅用量监控：定时跑 `claude -p "/usage" --output-format json --no-session-persistence`
 * 读取 5 小时窗口 / 周窗口的使用百分比与重置时间。
 * - 合规：CLI 用它自己的 OAuth 查询，本工具不接触令牌（实测 num_turns=0、cost=0，~400ms）。
 * - --no-session-persistence 防止每次轮询往 ~/.claude/projects 拉一条垃圾会话。
 * - result 是人类可读文本（含 locale），用宽松正则解析；解析不出也带上 raw 给前端兜底显示。
 */
export class UsageMonitor {
  private last: UsageSnapshot | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

  constructor(
    private binPath: string,
    private onUpdate: (u: UsageSnapshot) => void,
    private log: (level: "info" | "warn", msg: string) => void,
  ) {}

  start(intervalMs = 5 * 60_000): void {
    this.poll();
    this.timer = setInterval(() => this.poll(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getLast(): UsageSnapshot | null {
    return this.last;
  }

  /** 立即刷新一次（GUI 手动点刷新时用） */
  refresh(): void {
    this.poll();
  }

  private poll(): void {
    if (this.polling) return; // 上一次还没回来就跳过
    this.polling = true;
    const child = spawn(
      this.binPath,
      ["-p", "/usage", "--output-format", "json", "--no-session-persistence"],
      { stdio: ["ignore", "pipe", "pipe"], env: process.env },
    );
    let out = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (d: string) => (out += d));
    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }, 30_000);
    child.on("error", (e) => {
      clearTimeout(timeout);
      this.polling = false;
      this.log("warn", `用量查询启动失败: ${e.message}`);
    });
    child.on("close", () => {
      clearTimeout(timeout);
      this.polling = false;
      try {
        const j = JSON.parse(out.trim()) as { result?: string };
        const text = String(j.result ?? "");
        const snap = parseUsageText(text);
        if (snap) {
          this.last = snap;
          this.onUpdate(snap);
        } else {
          this.log("warn", `用量文本无法解析(已忽略): ${text.slice(0, 120)}`);
        }
      } catch {
        this.log("warn", `用量查询输出非 JSON(已忽略): ${out.slice(0, 120)}`);
      }
    });
  }
}

/** 解析 /usage 的人类可读输出。格式（实测 v2.1.170 英文 locale）：
 *   Current session: 36% used · resets Jun 11, 1:10am (Asia/Shanghai)
 *   Current week (all models): 15% used · resets Jun 15, 7am (Asia/Shanghai)
 */
export function parseUsageText(text: string): UsageSnapshot | null {
  const session = /Current session:\s*([\d.]+)%\s*used(?:\s*[·•]\s*resets\s*([^\n(]+))?/i.exec(text);
  const week = /Current week \(all models\):\s*([\d.]+)%\s*used(?:\s*[·•]\s*resets\s*([^\n(]+))?/i.exec(
    text,
  );
  if (!session && !week) return null;
  return {
    ts: Date.now(),
    sessionPct: session ? Number(session[1]) : undefined,
    sessionResets: session?.[2]?.trim(),
    weekPct: week ? Number(week[1]) : undefined,
    weekResets: week?.[2]?.trim(),
    raw: text,
  };
}
