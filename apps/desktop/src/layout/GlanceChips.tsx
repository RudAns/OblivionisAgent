import { useT } from "../i18n/index.js";

/** 一天的活动(来自 ~/.claude/stats-cache.json) */
interface DailyActivity {
  date: string; // YYYY-MM-DD
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}
interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}
export interface StatsData {
  dailyActivity: DailyActivity[];
  modelUsage: Record<string, ModelUsage>;
  totalSessions: number;
  totalMessages: number;
  longestSessionMs: number;
  firstSessionDate: string | null;
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
/** token 量用小写 m/k（对齐 Claude /stats 的 "77.0m"） */
function fmtTok(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "m";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}
/** 时长 ms → "56d 21h 28m" */
function fmtDur(ms: number): string {
  if (!ms) return "—";
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  const p: string[] = [];
  if (d) p.push(`${d}d`);
  if (h) p.push(`${h}h`);
  if (mm || !p.length) p.push(`${mm}m`);
  return p.join(" ");
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

/** "claude-opus-4-8" → "Opus 4.8" */
function prettyModel(id: string): string {
  const m = /claude-(opus|sonnet|haiku|fable)-(\d+)-?(\d+)?/i.exec(id || "");
  if (!m) return id || "—";
  const fam = m[1] ?? "";
  return `${fam.charAt(0).toUpperCase() + fam.slice(1)} ${m[2] ?? ""}${m[3] ? "." + m[3] : ""}`;
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

/** 建 N 天序列 [today-(n-1) .. today]，每天的消息数(没数据=0)——给 chip 的迷你趋势用 */
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

// ── 乐子：开发版「今日宜忌」黄历（程序 + 游戏开发用语，图一乐）──
const ALMANAC: string[] = [
  "代码 Review",
  "开新功能",
  "重构祖传代码",
  "删库跑路",
  "提测上线",
  "改需求",
  "加注释",
  "写单元测试",
  "抄 StackOverflow",
  "在 main 直接提交",
  "force push",
  "解合并冲突",
  "摸鱼",
  "早会发言",
  "估工时",
  "拒绝排期",
  "甩锅",
  "背锅",
  "修 bug",
  "顺手制造 bug",
  "通宵赶版本",
  "给变量起名",
  "升级依赖",
  "跳过 QA",
  "周五上线",
  "假装在看文档",
  "答应「明天就好」",
  "给老板演示 Demo",
  "关掉报警继续睡",
  "优化性能（其实改了个数字）",
  "立 flag",
  "周报注水",
  "听从策划建议",
  "功能宣讲",
  "数值平衡",
  "公示抽卡概率",
  "给 Boss 偷偷加血",
  "砍需求",
  "信策划「就改一点点」",
  "玩家反馈已读不回",
  "热更新",
  "调手感",
  "削版本之子",
  "加新皮肤",
  "重启试试",
  "在生产环境调试",
  "回滚大法",
  "硬编码",
  "留 TODO 给未来的自己",
  "相信「这是最后一个 bug」",
  "对着报错发呆",
  "把锅写进 commit message",
  "拉同事一起加班",
  "需求评审装睡",
  "PRD 只看图不看字",
  "把 warning 当没看见",
  "甩给 AI 写",
  "让 Claude 背锅",
  "把 deadline 当建议",
  "先上线再说",
  "画大饼",
  "跟产品对线",
  "祖传代码不敢动",
  "注释写「勿删」",
  "代码能跑就别动",
  "上线前烧香",
  "炼丹调参",
  "数值策划拍脑袋",
  "削最强英雄",
  "加强没人玩的英雄",
  "皮肤比平衡先出",
  "热修复修出新 bug",
  "首充 6 元",
  "概率写「仅供参考」",
  "拉通对齐",
  "对齐颗粒度",
  "赋能闭环",
  "会议越开越多",
  "老板说「很简单」",
  "产品又要改",
  "把 bug 说成 feature",
  "甩 issue 给开源作者",
  "复盘变甩锅大会",
  "需求一句话开发一礼拜",
  "用户说卡（其实是网速）",
];
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 按日期稳定抽「今日宜忌」：宜 2-3 个、忌 2-3 个、互不重复。同一天结果固定。 */
function dayFortune(dateStr: string): { yi: string[]; ji: string[] } {
  const rnd = mulberry32(hashStr(dateStr) || 1);
  const a = ALMANAC.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  const yiCount = 2 + Math.floor(rnd() * 2);
  const jiCount = 2 + Math.floor(rnd() * 2);
  return { yi: a.slice(0, yiCount), ji: a.slice(yiCount, yiCount + jiCount) };
}

/** 顶部「活动趋势」小标：chip 本身=近 7 天迷你趋势(图标)；悬停=今日宜忌 + 本月日历热力图 + 全量统计。读本地、不耗 token。 */
export function StatsChip({ stats, onHover }: { stats: StatsData; onHover?: () => void }) {
  const t = useT();
  const da = stats.dailyActivity ?? [];
  const by = new Map(da.map((d): [string, DailyActivity] => [d.date, d]));
  const now = new Date();
  const spark7 = buildSeries(now, 7, by);

  // ── 全量统计（对齐 Claude /stats Overview）──
  let favModel = "";
  let favIO = -1;
  let totalTokens = 0;
  for (const [m, u] of Object.entries(stats.modelUsage ?? {})) {
    const io = (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
    totalTokens += io;
    if (io > favIO) {
      favIO = io;
      favModel = m;
    }
  }
  const activeDays = da.length;
  const first = stats.firstSessionDate ? new Date(stats.firstSessionDate) : null;
  const lastStr = stats.lastComputedDate || (da.length ? da[da.length - 1]!.date : null);
  const last = lastStr ? new Date(`${lastStr}T00:00:00`) : null;
  const totalDays =
    first && last
      ? Math.max(1, Math.floor((last.getTime() - new Date(`${ymd(first)}T00:00:00`).getTime()) / 86400000) + 1)
      : 0;

  // 连续天数（最长 + 当前）
  const dateSet = new Set(da.map((d) => d.date));
  const sorted = [...dateSet].sort();
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const ds of sorted) {
    if (prev) {
      const diff = Math.round((new Date(`${ds}T00:00:00`).getTime() - new Date(`${prev}T00:00:00`).getTime()) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    } else run = 1;
    if (run > longestStreak) longestStreak = run;
    prev = ds;
  }
  let currentStreak = 0;
  if (sorted.length) {
    const cur = new Date(`${sorted[sorted.length - 1]!}T00:00:00`);
    while (dateSet.has(ymd(cur))) {
      currentStreak++;
      cur.setDate(cur.getDate() - 1);
    }
  }

  // 最活跃日（消息最多）
  let peakDate: string | null = null;
  let peakV = -1;
  for (const d of da) {
    if (d.messageCount > peakV) {
      peakV = d.messageCount;
      peakDate = d.date;
    }
  }

  // ── 本月日历热力图 ──
  const y = now.getFullYear();
  const mo = now.getMonth();
  const dim = new Date(y, mo + 1, 0).getDate();
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7; // 周一=0
  let monthMax = 1;
  for (let day = 1; day <= dim; day++) {
    monthMax = Math.max(monthMax, by.get(ymd(new Date(y, mo, day)))?.messageCount ?? 0);
  }
  const cells: ({ day: number; v: number; lvl: number; today: boolean; yi: string[]; ji: string[] } | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let day = 1; day <= dim; day++) {
    const ds = ymd(new Date(y, mo, day));
    const v = by.get(ds)?.messageCount ?? 0;
    const lvl = v <= 0 ? 0 : Math.min(4, Math.ceil((v / monthMax) * 4));
    const f = dayFortune(ds); // 每天自己的宜忌(悬停格子可见)
    cells.push({ day, v, lvl, today: day === now.getDate(), yi: f.yi, ji: f.ji });
  }
  const monthLabel = `${y}-${String(mo + 1).padStart(2, "0")}`;
  const fortune = dayFortune(ymd(now)); // 今日宜忌(浮框顶部展示)

  return (
    <span
      className="glance-chip stats-chip"
      onMouseEnter={() => onHover?.()}
      title={t("近 7 天活动趋势 · 悬停看本月用量与统计")}
    >
      <span className="chip-spark">
        {spark7.map((s) => (
          <span
            key={s.date}
            className="glance-bar"
            style={{ height: `${Math.max(8, Math.round((s.v / Math.max(1, ...spark7.map((x) => x.v))) * 100))}%` }}
            title={`${s.date.slice(5)} · ${fmtN(s.v)}`}
          />
        ))}
      </span>
      <span className="glance-pop glance-pop-stats">
        <div className="glance-h">{t("活动用量（读本地缓存，不耗 token）")}</div>
        <div className="alm">
          <div className="alm-h">{t("今日宜忌")}</div>
          <div className="alm-row">
            <span className="alm-badge yi">宜</span>
            <span className="alm-items">{fortune.yi.join(" · ")}</span>
          </div>
          <div className="alm-row">
            <span className="alm-badge ji">忌</span>
            <span className="alm-items">{fortune.ji.join(" · ")}</span>
          </div>
        </div>
        <div className="cal">
          <div className="cal-title">
            {t("本月")} · {monthLabel}
          </div>
          <div className="cal-week">
            {t("一 二 三 四 五 六 日")
              .split(" ")
              .map((w, i) => (
                <span key={i}>{w}</span>
              ))}
          </div>
          <div className="cal-grid">
            {cells.map((c, i) =>
              c ? (
                <span
                  key={i}
                  className={`cal-cell cal-l${c.lvl}${c.today ? " today" : ""}`}
                  title={`${monthLabel}-${String(c.day).padStart(2, "0")} · ${fmtN(c.v)}\n宜 ${c.yi.join("·")}\n忌 ${c.ji.join("·")}`}
                >
                  {c.day}
                </span>
              ) : (
                <span key={i} className="cal-cell empty" />
              ),
            )}
          </div>
          <div className="cal-legend">
            {t("少")}
            <i className="cal-l0" />
            <i className="cal-l1" />
            <i className="cal-l2" />
            <i className="cal-l3" />
            <i className="cal-l4" />
            {t("多")}
          </div>
        </div>
        <div className="glance-grid stats-grid">
          <div>
            <i>{t("常用模型")}</i>
            <b>{favModel ? prettyModel(favModel) : "—"}</b>
          </div>
          <div>
            <i>{t("总 token")}</i>
            <b>{fmtTok(totalTokens)}</b>
          </div>
          <div>
            <i>{t("会话数")}</i>
            <b>{fmtN(stats.totalSessions)}</b>
          </div>
          <div>
            <i>{t("最长会话")}</i>
            <b>{fmtDur(stats.longestSessionMs)}</b>
          </div>
          <div>
            <i>{t("活跃天数")}</i>
            <b>
              {activeDays}/{totalDays}
            </b>
          </div>
          <div>
            <i>{t("最长连续")}</i>
            <b>{t("{0} 天", longestStreak)}</b>
          </div>
          <div>
            <i>{t("最活跃")}</i>
            <b>{peakDate ? peakDate.slice(5) : "—"}</b>
          </div>
          <div>
            <i>{t("当前连续")}</i>
            <b>🔥 {t("{0} 天", currentStreak)}</b>
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
