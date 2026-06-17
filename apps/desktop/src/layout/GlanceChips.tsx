import { useT } from "../i18n/index.js";

/** 一天的活动(来自 ~/.claude/stats-cache.json) */
interface DailyActivity {
  date: string; // YYYY-MM-DD
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}
export interface StatsData {
  dailyActivity: DailyActivity[];
  totalSessions: number;
  totalMessages: number;
  lastComputedDate: string | null;
}
export interface StatusData {
  version: string;
  name: string;
  email: string;
  org: string;
  tier: string;
}

function fmtN(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n >= 100_000 ? 0 : 1) + "k";
  return String(n);
}

/** 本地日期 → YYYY-MM-DD（和 stats-cache 的 toDateString 一致，用本地时区） */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "claude_max" + "default_claude_max_20x" → "Max 20x" */
function prettyPlan(org: string, tier: string): string {
  const mult = /(\d+)x/i.exec(tier)?.[1];
  const name = /max/i.test(org)
    ? "Max"
    : /pro/i.test(org)
      ? "Pro"
      : /team/i.test(org)
        ? "Team"
        : /enterprise/i.test(org)
          ? "Enterprise"
          : org || "";
  return mult ? `${name} ${mult}x` : name;
}

/** 顶部「周活跃」小标：读 stats-cache，悬停看本周明细 + 7 日趋势 */
export function StatsChip({ stats, onHover }: { stats: StatsData; onHover?: () => void }) {
  const t = useT();
  const da = stats.dailyActivity ?? [];
  const active = new Set(da.map((d) => d.date));

  // 本周窗口=最近 7 天(含今天)。缓存只到昨天，所以今天通常计不到——悬停里标注「截至 X」。
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  const weekStartStr = ymd(weekStart);
  const inWeek = da.filter((d) => d.date >= weekStartStr);
  const weekDays = inWeek.length;
  const weekMsgs = inWeek.reduce((s, d) => s + d.messageCount, 0);
  const weekSessions = inWeek.reduce((s, d) => s + d.sessionCount, 0);
  const weekTools = inWeek.reduce((s, d) => s + d.toolCallCount, 0);

  // 连续活跃天数：从最近一个有活动的日子往回数
  let streak = 0;
  if (da.length) {
    const last = da[da.length - 1]!.date;
    const cur = new Date(`${last}T00:00:00`);
    while (active.has(ymd(cur))) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }
  }

  // 7 日趋势：today-6 .. today，每天的消息数(没数据=0)
  const spark: { date: string; v: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(now);
    dd.setDate(now.getDate() - i);
    const key = ymd(dd);
    spark.push({ date: key, v: da.find((x) => x.date === key)?.messageCount ?? 0 });
  }
  const sparkMax = Math.max(1, ...spark.map((s) => s.v));

  return (
    <span className="glance-chip" onMouseEnter={() => onHover?.()} title={t("Claude 活动统计（读本地缓存，不耗 token）")}>
      📊 {t("周 {0} 天", weekDays)}
      <span className="glance-pop">
        <div className="glance-h">{t("活动统计（估算）")}</div>
        <div className="glance-row">
          <span>{t("连续活跃")}</span>
          <b>🔥 {t("{0} 天", streak)}</b>
        </div>
        <div className="glance-spark">
          {spark.map((s) => (
            <span
              key={s.date}
              className="glance-bar"
              style={{ height: `${Math.max(8, Math.round((s.v / sparkMax) * 100))}%` }}
              title={`${s.date.slice(5)} · ${fmtN(s.v)}`}
            />
          ))}
        </div>
        <div className="glance-sub glance-spark-lbl">{t("近 7 天消息量")}</div>
        <div className="glance-grid">
          <div>
            <i>{t("本周消息")}</i>
            <b>{fmtN(weekMsgs)}</b>
          </div>
          <div>
            <i>{t("本周会话")}</i>
            <b>{fmtN(weekSessions)}</b>
          </div>
          <div>
            <i>{t("本周活跃")}</i>
            <b>{t("{0}/7 天", weekDays)}</b>
          </div>
          <div>
            <i>{t("本周工具调用")}</i>
            <b>{fmtN(weekTools)}</b>
          </div>
        </div>
        <div className="glance-sub">
          {t("累计 {0} 会话 · {1} 消息", fmtN(stats.totalSessions), fmtN(stats.totalMessages))}
          {stats.lastComputedDate ? ` · ${t("截至 {0}", stats.lastComputedDate)}` : ""}
        </div>
      </span>
    </span>
  );
}

/** 顶部「状态」小标：Claude 版本，悬停看账号 + 套餐 + 版本 */
export function StatusChip({ status, onHover }: { status: StatusData; onHover?: () => void }) {
  const t = useT();
  const plan = prettyPlan(status.org, status.tier);
  return (
    <span className="glance-chip" onMouseEnter={() => onHover?.()} title={t("Claude 状态（读本地配置，不耗 token）")}>
      <span className="glance-dot" />
      {status.version ? `v${status.version}` : "Claude"}
      <span className="glance-pop">
        <div className="glance-h">{t("Claude 状态")}</div>
        {status.name && (
          <div className="glance-row">
            <span>{t("账号")}</span>
            <b>{status.name}</b>
          </div>
        )}
        {status.email && (
          <div className="glance-row">
            <span>{t("邮箱")}</span>
            <b className="glance-mono">{status.email}</b>
          </div>
        )}
        {plan && (
          <div className="glance-row">
            <span>{t("套餐")}</span>
            <b>{plan}</b>
          </div>
        )}
        <div className="glance-row">
          <span>{t("CLI 版本")}</span>
          <b>{status.version ? `v${status.version}` : "—"}</b>
        </div>
      </span>
    </span>
  );
}
