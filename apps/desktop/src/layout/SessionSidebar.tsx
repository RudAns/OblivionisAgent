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
  onSelect: (nodeId: string) => void;
  onOpenTerminal: (nodeId: string) => void;
  onAddSession: () => void;
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
  onSelect,
  onOpenTerminal,
  onAddSession,
}: Props) {
  return (
    <div className="rail">
      <div className="rail-head">
        <span className="rail-title">会话 · {claudeNodes.length}</span>
        <button className="rail-toggle" title="新建 Claude 会话节点" onClick={onAddSession}>
          +
        </button>
      </div>
      <div className="rail-list">
        {claudeNodes.length === 0 && <div className="rail-empty">还没有 Claude 会话节点</div>}
        {claudeNodes.map((n) => {
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
              title={`${d.cwd || ""}\n单击=打开/聚焦开发终端 · 💬=看访客转录`}
              onClick={() => onOpenTerminal(n.id)}
            >
              <div className="rail-card-top">
                <span className={`rail-dot status-${d.status ?? "idle"}`} />
                <span className="rail-label">{d.label || "会话"}</span>
                {done && <span className="rail-flag" title="有已完成的回复，还没查看" />}
                {open && (
                  <span className="rail-open" title="终端已打开">
                    ▮
                  </span>
                )}
                <button
                  className="rail-transcript"
                  title="查看访客会话转录（少用）"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(n.id);
                  }}
                >
                  💬
                </button>
              </div>
              <div className="rail-cwd">{d.cwd || "(未设置工作区)"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
