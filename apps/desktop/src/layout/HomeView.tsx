import type { Node, Edge } from "@xyflow/react";
import type { UsageSnapshot, CostSnapshot } from "@oblivionis/shared";
import { useT } from "../i18n/index.js";
import { FeishuStatusDot, type FeishuState } from "../panels/FeishuPanel.js";
import { dayFortune, fmtDur, prettyModel, type AppVer, type StatsData } from "./GlanceChips.js";
import appIcon from "../assets/app-icon.png";

// 与画布同源的节点配色（缩略图按类型用色块表现，不放图标）。
const NODE_COLOR: Record<string, string> = {
  "feishu-group": "#3b9b70",
  route: "#8167b2",
  "intent-switch": "#c68a32",
  "claude-session": "#d96745",
  cron: "#3a8fa0",
  webhook: "#b7791f",
  soul: "#9d7bc9",
  skill: "#3a8fa0",
  subagent: "#c0517a",
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtN(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n >= 100_000 ? 0 : 1) + "k";
  return String(n);
}
function fmtUsd(n: number): string {
  if (n >= 100) return "$" + n.toFixed(0);
  if (n >= 1) return "$" + n.toFixed(2);
  return "$" + n.toFixed(3);
}

interface Daily {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}
/** 把 deep 扫到的近期每日活动补进 dailyActivity（与 GlanceChips 同逻辑）。 */
function mergeRecent(stats: StatsData): Daily[] {
  const base = (stats.dailyActivity ?? []) as Daily[];
  const rd = stats.recentDays ?? [];
  if (!rd.length) return base;
  const dates = new Set(rd.map((r) => r.date));
  const out = base
    .filter((x) => !dates.has(x.date))
    .concat(rd.map((r) => ({ date: r.date, messageCount: r.messageCount, sessionCount: r.sessionCount, toolCallCount: r.toolCallCount })));
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/** 节点编排「总览」缩略图：纯 SVG，viewBox 直接取图的真实包围盒 → 浏览器按容器自动等比缩放铺满，
 *  节点画成与画布一致的小卡（类型色顶条 + 图标 + 截断标签），连线画成贝塞尔。只读、不可交互。 */
function GraphMiniature({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const NW = 184;
  const NH = 96;
  const PAD = 70;

  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs) + NW;
  const maxY = Math.max(...ys) + NH;
  const vbX = minX - PAD;
  const vbY = minY - PAD;
  const vbW = Math.max(1, maxX - minX) + PAD * 2;
  const vbH = Math.max(1, maxY - minY) + PAD * 2;

  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const center = (n: Node) => ({ cx: n.position.x + NW / 2, cy: n.position.y + NH / 2 });

  // 缩略图：不放图标/文字，只用「圆角色块 + 连线」表现结构。色块在真实槽位里居中收一圈 → 块间留白，像干净的网络图。
  const CW = NW * 0.74;
  const CH = NH * 0.6;

  return (
    <svg className="gm-svg" viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet">
      <g className="gm-edges">
        {edges.map((e) => {
          const s = byId.get(e.source);
          const t = byId.get(e.target);
          if (!s || !t) return null;
          const a = center(s);
          const b = center(t);
          const mx = (a.cx + b.cx) / 2;
          return <path key={e.id} className="gm-edge" d={`M ${a.cx} ${a.cy} C ${mx} ${a.cy}, ${mx} ${b.cy}, ${b.cx} ${b.cy}`} />;
        })}
      </g>
      {nodes.map((n) => {
        const cx = n.position.x + NW / 2;
        const cy = n.position.y + NH / 2;
        const col = NODE_COLOR[n.type ?? ""] ?? "#8a93a0";
        return (
          <rect
            key={n.id}
            className="gm-node"
            x={cx - CW / 2}
            y={cy - CH / 2}
            width={CW}
            height={CH}
            rx={CH * 0.34}
            style={{ fill: col, stroke: `color-mix(in srgb, ${col} 68%, #000)` }}
          />
        );
      })}
    </svg>
  );
}

/** 本月活动日历（热力图）+ 几个关键统计——读本地缓存，不耗 token。 */
function ActivityCalendar({ stats }: { stats: StatsData | null }) {
  const t = useT();
  const da = stats ? mergeRecent(stats) : [];
  const by = new Map(da.map((d) => [d.date, d] as const));
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const dim = new Date(y, mo + 1, 0).getDate();
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7; // 周一=0
  let monthMax = 1;
  for (let d = 1; d <= dim; d++) monthMax = Math.max(monthMax, by.get(ymd(new Date(y, mo, d)))?.messageCount ?? 0);
  const cells: ({ day: number; v: number; lvl: number; today: boolean } | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) {
    const v = by.get(ymd(new Date(y, mo, d)))?.messageCount ?? 0;
    const lvl = v <= 0 ? 0 : Math.min(4, Math.ceil((v / monthMax) * 4));
    cells.push({ day: d, v, lvl, today: d === now.getDate() });
  }
  const monthLabel = `${y}-${String(mo + 1).padStart(2, "0")}`;

  // 连续天数（当前 + 最长）
  const dateSet = new Set(da.map((d) => d.date));
  const sorted = [...dateSet].sort();
  let curStreak = 0;
  if (sorted.length) {
    const c = new Date(`${sorted[sorted.length - 1]!}T00:00:00`);
    while (dateSet.has(ymd(c))) {
      curStreak++;
      c.setDate(c.getDate() - 1);
    }
  }
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const ds of sorted) {
    run = prev && Math.round((new Date(`${ds}T00:00:00`).getTime() - new Date(`${prev}T00:00:00`).getTime()) / 86400000) === 1 ? run + 1 : 1;
    if (run > longestStreak) longestStreak = run;
    prev = ds;
  }

  // 常用模型（对齐顶部活动 chip 悬浮里的统计，信息不变，搬到这里填满日历卡）
  let favModel = "";
  let favIO = -1;
  for (const [m, u] of Object.entries(stats?.modelUsage ?? {})) {
    const io = (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
    if (io > favIO) {
      favIO = io;
      favModel = m;
    }
  }

  const fortune = dayFortune(ymd(now)); // 今日运势（程序/游戏开发用语的黄历宜忌，图一乐）

  return (
    <div className="dash-card dash-cal">
      <div className="dash-card-h">
        <span className="dch-title">🗓 {t("活动日历")}</span>
        <span className="dch-sub">
          {monthLabel}
          <i className="dcal-legend">
            <i className="l0" />
            <i className="l1" />
            <i className="l2" />
            <i className="l3" />
            <i className="l4" />
          </i>
        </span>
      </div>
      <div className="dash-card-body dcal-body">
        <div className="dcal-top">
          <div className="dcal-week">
            {t("一 二 三 四 五 六 日")
              .split(" ")
              .map((w, i) => (
                <span key={i}>{w}</span>
              ))}
          </div>
          <div className="dcal-grid">
            {cells.map((c, i) =>
              c ? (
                <span
                  key={i}
                  className={`dcal-cell l${c.lvl}${c.today ? " today" : ""}`}
                  title={`${monthLabel}-${String(c.day).padStart(2, "0")} · ${fmtN(c.v)} ${t("消息")}`}
                >
                  {c.day}
                </span>
              ) : (
                <span key={i} className="dcal-cell empty" />
              ),
            )}
          </div>
        </div>
        <div className="dcal-stats">
          <div className="dcs">
            <i>{t("当前连续")}</i>
            <b>🔥 {t("{0} 天", curStreak)}</b>
          </div>
          <div className="dcs">
            <i>{t("最长连续")}</i>
            <b>{t("{0} 天", longestStreak)}</b>
          </div>
          <div className="dcs">
            <i>{t("活跃天数")}</i>
            <b>{da.length || "—"}</b>
          </div>
          <div className="dcs">
            <i>{t("累计消息")}</i>
            <b>{stats ? fmtN(stats.totalMessages) : "—"}</b>
          </div>
          <div className="dcs">
            <i>{t("常用模型")}</i>
            <b>{favModel ? prettyModel(favModel) : "—"}</b>
          </div>
          <div className="dcs">
            <i>{t("最长会话")}</i>
            <b>{stats?.longestSessionMs ? fmtDur(stats.longestSessionMs) : "—"}</b>
          </div>
        </div>
        <div className="dcal-fortune">
          <div className="dcf-h">{t("今日宜忌")}</div>
          <div className="dcf-row">
            <span className="dcf-badge yi">{t("宜")}</span>
            <span className="dcf-items">{fortune.yi.join(" · ")}</span>
          </div>
          <div className="dcf-row">
            <span className="dcf-badge ji">{t("忌")}</span>
            <span className="dcf-items">{fortune.ji.join(" · ")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 订阅用量（5h / 周窗口）——信息少，做成两条紧凑横条，矮一点。 */
function UsageMeter({ usage }: { usage: UsageSnapshot | null }) {
  const t = useT();
  const sp = usage?.sessionPct;
  const wp = usage?.weekPct;
  const cls = (p?: number) => (p == null ? "" : p >= 85 ? "hot" : p >= 60 ? "warm" : "");
  const row = (label: string, p: number | undefined, reset?: string) => (
    <div className="um-row" title={reset ? t("{0} 重置", reset) : undefined}>
      <span className="um-lb">{label}</span>
      <span className="um-bar">
        <span className={cls(p)} style={{ width: `${Math.min(100, p ?? 0)}%` }} />
      </span>
      <b className={cls(p)}>{p != null ? `${Math.round(p)}%` : "—"}</b>
    </div>
  );
  return (
    <div className="dash-card dash-usage">
      <div className="dash-card-h">
        <span className="dch-title">📊 {t("订阅用量")}</span>
        <span className="dch-sub">{t("每 5 分钟刷新")}</span>
      </div>
      <div className="dash-card-body">
        {row("5h", sp, usage?.sessionResets)}
        {row(t("周"), wp, usage?.weekResets)}
      </div>
    </div>
  );
}

/** 成本看板摘要：今日/累计/运行 + 按会话花费排行（横条）。点开看全量。 */
function CostSummary({ cost, onOpen }: { cost: CostSnapshot | null; onOpen: () => void }) {
  const t = useT();
  const top = [...(cost?.perNode ?? [])].sort((a, b) => b.cost - a.cost).slice(0, 5);
  const max = Math.max(1e-9, ...top.map((s) => s.cost));
  return (
    <button className="dash-card dash-cost" onClick={onOpen} title={t("点开看成本看板全量")}>
      <div className="dash-card-h">
        <span className="dch-title">💰 {t("成本看板")}</span>
        <span className="dch-sub">{t("查看全部 →")}</span>
      </div>
      <div className="dash-card-body">
        <div className="cost-nums">
          <div className="cn">
            <i>{t("今日")}</i>
            <b>{cost ? fmtUsd(cost.today) : "—"}</b>
          </div>
          <div className="cn">
            <i>{t("累计")}</i>
            <b>{cost ? fmtUsd(cost.total) : "—"}</b>
          </div>
          <div className="cn">
            <i>{t("运行")}</i>
            <b>{cost ? fmtN(cost.runs) : "—"}</b>
          </div>
        </div>
        <div className="cost-rank">
          {top.length ? (
            top.map((s) => (
              <div className="crk" key={s.nodeId}>
                <span className="crk-lb" title={s.label}>{s.label || t("(未命名)")}</span>
                <span className="crk-bar">
                  <span style={{ width: `${Math.round((s.cost / max) * 100)}%` }} />
                </span>
                <span className="crk-v">{fmtUsd(s.cost)}</span>
              </div>
            ))
          ) : (
            <div className="cost-empty">{t("暂无花费数据 · 跑过会话后这里按花费排行")}</div>
          )}
        </div>
      </div>
    </button>
  );
}

export interface HomeViewProps {
  nodes: Node[];
  edges: Edge[];
  stats: StatsData | null;
  usage: UsageSnapshot | null;
  cost: CostSnapshot | null;
  sessionCount: number;
  openTerminals: number;
  feishu: FeishuState;
  app: AppVer | null;
  inboxBadge: number;
  onOpenCanvas: () => void;
  onOpenTerminal: () => void;
  onOpenCost: () => void;
}

/** 欢迎主页：占满视窗的「一图流」仪表盘——节点编排总览 + 订阅用量 + 成本看板 + 活动日历，
 *  各信息一眼尽收，不再是一堆跳转按钮。导航靠左侧图标栏。 */
export function HomeView(props: HomeViewProps) {
  const t = useT();
  const { nodes, edges, stats, usage, cost, sessionCount, openTerminals, feishu, app, inboxBadge, onOpenCanvas, onOpenTerminal, onOpenCost } = props;

  return (
    <div className="home-view">
      <div className="home-dash">
        <header className="dash-hero">
          <div className="dash-brand">
            <img className="dash-logo" src={appIcon} alt="OblivionisAgent" draggable={false} />
            <div className="dash-brand-txt">
              <h1>
                Oblivionis<span className="dash-accent">Agent</span>
                {app?.version && <span className="dash-ver">v{app.version}</span>}
              </h1>
              <p>{t("把飞书群接入本地 Claude 会话 · 连线即编排")}</p>
            </div>
          </div>
          <div className="dash-hero-right">
            <div className="dash-stats">
              <span className="dst">
                <b>{sessionCount}</b>
                {t("会话节点")}
              </span>
              <span className="dst">
                <b>{openTerminals}</b>
                {t("开着的终端")}
              </span>
              {inboxBadge > 0 && (
                <span className="dst dst-badge">
                  <b>{inboxBadge}</b>
                  {t("待裁决")}
                </span>
              )}
              <span className="dst dst-feishu">
                <FeishuStatusDot status={feishu.status} />
                {feishu.bot?.name ? feishu.bot.name : t("飞书未连接")}
              </span>
            </div>
            <div className="dash-acts">
              <button className="dash-act" onClick={onOpenCanvas}>
                🗺 {t("节点画布")}
              </button>
              <button className="dash-act ghost" onClick={onOpenTerminal}>
                🖥 {t("进入终端")}
              </button>
            </div>
          </div>
        </header>

        <button className="dash-card dash-graph" onClick={onOpenCanvas} title={t("打开节点编排窗口")}>
          <div className="dash-card-h">
            <span className="dch-title">🗺 {t("节点编排总览")}</span>
            <span className="dch-sub">{t("打开画布 →")}</span>
          </div>
          <div className="dash-card-body dgraph-body">
            {nodes.length ? <GraphMiniature nodes={nodes} edges={edges} /> : <div className="dgraph-empty">{t("还没有节点 · 点这里打开画布搭第一条链路")}</div>}
          </div>
        </button>

        {/* 节点图占左上(大)；成本在其正下方(宽)；右整列=活动日历(高)+订阅用量(矮)。卡片半透融成一块。 */}
        <CostSummary cost={cost} onOpen={onOpenCost} />
        <div className="dash-side">
          <ActivityCalendar stats={stats} />
          <UsageMeter usage={usage} />
        </div>
      </div>
    </div>
  );
}
