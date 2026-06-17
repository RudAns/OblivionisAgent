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
export interface AppVer {
  version: string;
  buildMs: number;
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

/** epoch ms → "YYYY-MM-DD HH:mm"（本地） */
function fmtBuild(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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

/** 建 N 天序列 [today-(n-1) .. today]，每天的消息数(没数据=0) */
function buildSeries(now: Date, n: number, by: Map<string, DailyActivity>): { date: string; v: number }[] {
  const out: { date: string; v: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = ymd(d);
    out.push({ date: key, v: by.get(key)?.messageCount ?? 0 });
  }
  return out;
}

/** 一排迷你柱状图，最后一根(今天)由 CSS :last-child 高亮 */
function Bars({ data, cls }: { data: { date: string; v: number }[]; cls: string }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <span className={cls}>
      {data.map((s) => (
        <span
          key={s.date}
          className="glance-bar"
          style={{ height: `${Math.max(6, Math.round((s.v / max) * 100))}%` }}
          title={`${s.date.slice(5)} · ${fmtN(s.v)}`}
        />
      ))}
    </span>
  );
}

/** 顶部「活动趋势」小标：chip 本身就是近 7 天迷你趋势；悬停看 30 天用量看板 + 本周统计。读本地缓存、不耗 token。 */
export function StatsChip({ stats, onHover }: { stats: StatsData; onHover?: () => void }) {
  const t = useT();
  const da = stats.dailyActivity ?? [];
  const by = new Map(da.map((d): [string, DailyActivity] => [d.date, d]));
  const active = new Set(da.map((d) => d.date));
  const now = new Date();
  const spark7 = buildSeries(now, 7, by);
  const days30 = buildSeries(now, 30, by);

  // 本周：从本周一(含)到今天。缓存只到昨天，今天的活动不在里面——所以周三看到的多半是周一+周二。
  const dow = (now.getDay() + 6) % 7; // 周一=0
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dow);
  const wStart = ymd(weekStart);
  const inWeek = da.filter((d) => d.date >= wStart);
  const weekDays = inWeek.length;
  const weekMsgs = inWeek.reduce((s, d) => s + d.messageCount, 0);
  const weekSessions = inWeek.reduce((s, d) => s + d.sessionCount, 0);

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

  return (
    <span
      className="glance-chip stats-chip"
      onMouseEnter={() => onHover?.()}
      title={t("近 7 天活动趋势 · 悬停看 30 天用量")}
    >
      <Bars data={spark7} cls="chip-spark" />
      <span className="glance-pop glance-pop-wide">
        <div className="glance-h">{t("活动用量（读本地缓存，不耗 token）")}</div>
        <Bars data={days30} cls="glance-spark30" />
        <div className="glance-sub glance-spark-lbl">{t("近 30 天每日消息（今天高亮）")}</div>
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
            <b>{t("{0} 天", weekDays)}</b>
          </div>
          <div>
            <i>{t("连续活跃")}</i>
            <b>🔥 {t("{0} 天", streak)}</b>
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

/** 左上角品牌名：悬停显示本软件版本+构建时间，以及 Claude CLI 版本/账号/套餐。读本地、不耗 token。 */
export function BrandInfo({ status, app }: { status: StatusData | null; app: AppVer | null }) {
  const t = useT();
  const plan = status ? prettyPlan(status.org, status.tier) : "";
  return (
    <span className="brand-wrap">
      <strong className="brand" data-tauri-drag-region>
        Oblivionis<span className="brand-accent">Agent</span>
      </strong>
      <span className="brand-pop">
        <div className="glance-h">OblivionisAgent</div>
        <div className="glance-row">
          <span>{t("版本")}</span>
          <b>v{app?.version ?? "—"}</b>
        </div>
        <div className="glance-row">
          <span>{t("构建")}</span>
          <b>{app ? fmtBuild(app.buildMs) : "—"}</b>
        </div>
        {status && (
          <>
            <div className="brand-div" />
            <div className="glance-row">
              <span>Claude CLI</span>
              <b>{status.version ? `v${status.version}` : "—"}</b>
            </div>
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
          </>
        )}
      </span>
    </span>
  );
}
