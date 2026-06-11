import type { Node } from "@xyflow/react";

interface Props {
  claudeNodes: Node[];
  selected: string | null;
  activeTerminalId: string | null;
  openedTerminals: string[];
  onSelect: (nodeId: string) => void;
  onOpenTerminal: (nodeId: string) => void;
  onAddSession: () => void;
}

/**
 * 会话侧栏（常驻）：所有 Claude 会话节点的卡片列表。
 * 单击=选中(看转录·访客会话)；双击=打开开发终端。画布收起时这里是会话的唯一入口。
 */
export function SessionSidebar({
  claudeNodes,
  selected,
  activeTerminalId,
  openedTerminals,
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
          return (
            <div
              key={n.id}
              className={`rail-card ${selected === n.id ? "sel" : ""} ${
                activeTerminalId === n.id ? "active" : ""
              }`}
              title={`${d.cwd || ""}\n单击=选择(看转录·访客会话) · 双击=打开开发终端`}
              onClick={() => onSelect(n.id)}
              onDoubleClick={() => onOpenTerminal(n.id)}
            >
              <div className="rail-card-top">
                <span className={`rail-dot status-${d.status ?? "idle"}`} />
                <span className="rail-label">{d.label || "会话"}</span>
                {open && (
                  <span className="rail-open" title="终端已打开">
                    ▮
                  </span>
                )}
              </div>
              <div className="rail-cwd">{d.cwd || "(未设置工作区)"}</div>
              <div className="rail-actions">
                <button
                  className="rail-act"
                  title="查看访客会话转录"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(n.id);
                  }}
                >
                  💬 转录
                </button>
                <button
                  className="rail-act"
                  title="打开开发终端"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTerminal(n.id);
                  }}
                >
                  ⌨ 终端
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
