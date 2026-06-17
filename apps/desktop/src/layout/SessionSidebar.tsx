import { useMemo, useState } from "react";
import type { Node } from "@xyflow/react";
import { usePointerReorder } from "../usePointerReorder.js";
import { useT } from "../i18n/index.js";

interface Props {
  claudeNodes: Node[];
  selected: string | null;
  activeTerminalId: string | null;
  openedTerminals: string[];
  /** 各会话终端是否在跑（输出活动）→ 绿色扫光 */
  termRunning: Record<string, boolean>;
  /** 完成但还没切过去看的会话 → 小旗红点 */
  unseenDone: Record<string, boolean>;
  /** 拖动会话卡片改变顺序：把 dragId 移到 dropId 之前(after=false)/之后(after=true) */
  onReorder?: (dragId: string, dropId: string, after: boolean) => void;
  onOpenTerminal: (nodeId: string) => void;
  onAddSession: () => void;
}

/**
 * 会话侧栏（常驻）：所有 Claude 会话节点的卡片列表。
 * 交互模型：卡片只决定「哪个会话」；「终端 / 转录」是同一会话的两种视图，靠面板顶部小页签切换。
 * - 单击卡片 = 选中该会话，右侧按"当前视图类型"显示它（视图粘滞：在看终端就显示它的终端、
 *   在看转录就显示它的转录），不再强制跳终端。终端保活，再点只聚焦不重开。
 * - 画布(节点视图)下单击 = 定位到该节点（选中+居中），不切去面板。
 */
export function SessionSidebar({
  claudeNodes,
  selected,
  activeTerminalId,
  openedTerminals,
  termRunning,
  unseenDone,
  onReorder,
  onOpenTerminal,
  onAddSession,
}: Props) {
  const t = useT();
  // 会话卡片拖拽排序（指针拖拽；纵向，插入横线）
  const { dragId, dropClass, itemProps } = usePointerReorder(onReorder, "vertical");
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
        <span className="rail-title">{t("会话 · {0}", claudeNodes.length)}</span>
        <button className="rail-toggle" title={t("新建 Claude 会话节点")} onClick={onAddSession}>
          +
        </button>
      </div>
      {showSearch && (
        <div className="rail-search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("搜索会话 / 工作区…")}
            spellCheck={false}
          />
          {q && (
            <button className="rail-search-x" title={t("清除")} onClick={() => setQ("")}>
              ×
            </button>
          )}
        </div>
      )}
      <div className="rail-list">
        {claudeNodes.length === 0 && <div className="rail-empty">{t("还没有 Claude 会话节点")}</div>}
        {claudeNodes.length > 0 && shown.length === 0 && (
          <div className="rail-empty">{t("没有匹配「{0}」的会话", q)}</div>
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
              } ${sweep} ${d.status === "error" ? "err" : ""} ${dragId === n.id ? "dragging" : ""} ${dropClass(n.id)}`}
              title={`${d.cwd || ""}\n${t("单击=查看此会话(保持当前 终端/转录 视图) · 拖动可排序")}`}
              {...itemProps(n.id, () => onOpenTerminal(n.id))}
            >
              <div className="rail-card-top">
                <span className={`rail-dot status-${d.status ?? "idle"}`} />
                <span className="rail-label">{d.label || t("会话")}</span>
                {done && (
                  <span className="rail-flag" title={t("终端任务已完成，还没查看")}>
                    <svg width="11" height="13" viewBox="0 0 12 14" fill="none">
                      <path d="M2.6 1 V13.2" stroke="#ff5a4d" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M2.6 1.7 H10.2 L7.9 4 L10.2 6.3 H2.6 Z" fill="#ff5a4d" />
                    </svg>
                  </span>
                )}
                {open && (
                  <span className="rail-open" title={t("终端已打开")}>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
