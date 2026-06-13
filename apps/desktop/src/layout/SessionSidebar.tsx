import { useMemo, useState } from "react";
import type { Node } from "@xyflow/react";

interface Props {
  claudeNodes: Node[];
  selected: string | null;
  activeTerminalId: string | null;
  openedTerminals: string[];
  /** 各会话终端是否在跑（输出活动）→ 绿色扫光 */
  termRunning: Record<string, boolean>;
  /** 完成但还没切过去看的会话 → 小旗红点 */
  unseenDone: Record<string, boolean>;
  /** 每会话活动统计（本次运行内）：处理轮数 / 累计输出 token / 最近活跃时刻 */
  stats?: Record<string, { msgs: number; outTokens: number; lastTs: number }>;
  onSelect: (nodeId: string) => void;
  onOpenTerminal: (nodeId: string) => void;
  onAddSession: () => void;
}

/** token 数紧凑显示：1234→1.2k，1230000→1.2M */
function fmtTok(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}
/** 最近活跃相对时间：刚刚 / N分钟前 / N小时前 */
function fmtAgo(ts: number): string {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)}分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)}小时前`;
  return `${Math.floor(s / 86400)}天前`;
}

/**
 * 会话侧栏（常驻）：所有 Claude 会话节点的卡片列表。
 * 交互模型：卡片决定「哪个会话」，左侧图标栏决定「看哪个视图」。
 * - 单击卡片 = 打开/聚焦该会话的开发终端（主操作；终端保活，再点只聚焦不重开）。
 * - 访客转录是少用功能 → 降级成卡片上的 💬 小按钮（或图标栏的「转录」）。
 * 画布收起时这里是会话的唯一入口。
 */
export function SessionSidebar({
  claudeNodes,
  selected,
  activeTerminalId,
  openedTerminals,
  termRunning,
  unseenDone,
  stats,
  onOpenTerminal,
  onAddSession,
}: Props) {
  // 会话多时才露出搜索框：按名称/工作区过滤，找会话不用一路滚
  const [q, setQ] = useState("");
  const showSearch = claudeNodes.length > 6;
  const query = q.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!query) return claudeNodes;
    return claudeNodes.filter((n) => {
      const d = n.data as { label?: string; cwd?: string };
      return `${d.label ?? ""} ${d.cwd ?? ""}`.toLowerCase().includes(query);
    });
  }, [claudeNodes, query]);
  return (
    <div className="rail">
      <div className="rail-head">
        <span className="rail-title">会话 · {claudeNodes.length}</span>
        <button className="rail-toggle" title="新建 Claude 会话节点" onClick={onAddSession}>
          +
        </button>
      </div>
      {showSearch && (
        <div className="rail-search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索会话 / 工作区…"
            spellCheck={false}
          />
          {q && (
            <button className="rail-search-x" title="清除" onClick={() => setQ("")}>
              ×
            </button>
          )}
        </div>
      )}
      <div className="rail-list">
        {claudeNodes.length === 0 && <div className="rail-empty">还没有 Claude 会话节点</div>}
        {claudeNodes.length > 0 && shown.length === 0 && (
          <div className="rail-empty">没有匹配「{q}」的会话</div>
        )}
        {shown.map((n) => {
          const d = n.data as { label?: string; cwd?: string; status?: string };
          const open = openedTerminals.includes(n.id);
          const forkRun = d.status === "running"; // 飞书 fork 正在处理
          const termRun = !!termRunning[n.id]; // 终端正在跑
          // 扫光：两个都跑=彩色光，仅 fork=蓝，仅终端=绿
          const sweep = forkRun && termRun ? "sweep-rainbow" : forkRun ? "sweep-fork" : termRun ? "sweep-term" : "";
          const done = !!unseenDone[n.id];
          return (
            <div
              key={n.id}
              className={`rail-card ${activeTerminalId === n.id ? "active" : ""} ${
                selected === n.id && activeTerminalId !== n.id ? "sel" : ""
              } ${sweep}`}
              title={`${d.cwd || ""}\n单击=打开/聚焦开发终端`}
              onClick={() => onOpenTerminal(n.id)}
            >
              <div className="rail-card-top">
                <span className={`rail-dot status-${d.status ?? "idle"}`} />
                <span className="rail-label">{d.label || "会话"}</span>
                {done && (
                  <span className="rail-flag" title="终端任务已完成，还没查看">
                    <svg width="11" height="13" viewBox="0 0 12 14" fill="none">
                      <path d="M2.6 1 V13.2" stroke="#ff5a4d" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M2.6 1.7 H10.2 L7.9 4 L10.2 6.3 H2.6 Z" fill="#ff5a4d" />
                    </svg>
                  </span>
                )}
                {open && (
                  <span className="rail-open" title="终端已打开">
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="1.8" y="3" width="12.4" height="10" rx="2.2" />
                      <path d="M4.6 6.4 6.8 8.1 4.6 9.8" />
                      <line x1="8.2" y1="10" x2="11" y2="10" />
                    </svg>
                  </span>
                )}
              </div>
              <div className="rail-cwd">{d.cwd || "(未设置工作区)"}</div>
              {(() => {
                const st = stats?.[n.id];
                if (!st || st.msgs === 0) return null;
                return (
                  <div className="rail-stats" title="本次软件运行内的活动统计">
                    <span>↩ {st.msgs} 轮</span>
                    <span>⌨ {fmtTok(st.outTokens)} tok</span>
                    {st.lastTs ? <span className="rail-stats-ago">· {fmtAgo(st.lastTs)}</span> : null}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
