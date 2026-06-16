import { Handle, Position, useNodeId } from "@xyflow/react";
import { useContext, type ReactNode } from "react";
import { NodeActionContext } from "../node-action-context.js";
import { useT } from "../../i18n/index.js";

/**
 * 节点卡片统一外壳（参考专业流程图工具）：
 * 彩色头部条(按节点种类着色) = 图标 + 名称 + 状态点；暗色主体 = 字段行。
 * 颜色由 CSS 变量 --nc 控制（.xnode-<kind> 里定义）。
 */
export function NodeShell({
  kind,
  icon,
  label,
  selected,
  status,
  hasTarget = true,
  hasSource = true,
  sourcePosition = Position.Right,
  children,
}: {
  kind: string;
  icon: ReactNode;
  label: string;
  selected?: boolean;
  status?: string;
  hasTarget?: boolean;
  hasSource?: boolean;
  /** 输出口位置（默认右；人格/技能/子代理这类辅助节点放左） */
  sourcePosition?: Position;
  children?: ReactNode;
}) {
  // hover 快捷操作：复制 / 删除
  const id = useNodeId();
  const t = useT();
  const { copyNode, deleteNode } = useContext(NodeActionContext);
  return (
    <div className={`xnode xnode-${kind} ${selected ? "selected" : ""} ${status ? `xn-${status}` : ""}`}>
      {hasTarget && <Handle type="target" position={Position.Left} />}
      {id && (
        <div className="xnode-actions">
          <button
            className="xn-act"
            title={t("复制此节点")}
            onClick={(e) => {
              e.stopPropagation();
              copyNode(id);
            }}
          >
            ⎘
          </button>
          <button
            className="xn-act danger"
            title={t("删除此节点及其连线")}
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
          >
            🗑
          </button>
        </div>
      )}
      <div className="xnode-head">
        <span className="xnode-icon">{icon}</span>
        <span className="xnode-label" title={label}>
          {label}
        </span>
        {/* C1 状态药丸：运行中/出错时显示文字状态(比单个点更清楚)；空闲只留下面的点保持干净 */}
        {status && status !== "idle" && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 7px",
              borderRadius: 999,
              whiteSpace: "nowrap",
              background: status === "error" ? "rgba(200,60,60,.16)" : "rgba(217,103,69,.16)",
              color: status === "error" ? "#c83c3c" : "#d96745",
            }}
          >
            {status === "running" ? t("运行中") : status === "error" ? t("出错") : status}
          </span>
        )}
        {status && <span className={`xnode-dot status-${status}`} title={status} />}
      </div>
      {children && <div className="xnode-body">{children}</div>}
      {hasSource && <Handle type="source" position={sourcePosition} />}
    </div>
  );
}

/** 卡片主体的一行字段：左键名右值，值过长省略。title=hover 看完整值(路径/ID 截断时用) */
export function Row({ k, v, dim, title }: { k: string; v: ReactNode; dim?: boolean; title?: string }) {
  return (
    <div className={`xnode-row ${dim ? "dim" : ""}`}>
      <span className="xr-k">{k}</span>
      <span className="xr-v" title={title}>
        {v}
      </span>
    </div>
  );
}

/** 路径类长值的截断显示（保尾部更有辨识度，如 cwd） */
export function tailTruncate(s: string | undefined, max = 26): string {
  if (!s) return "";
  return s.length <= max ? s : "…" + s.slice(-max);
}
