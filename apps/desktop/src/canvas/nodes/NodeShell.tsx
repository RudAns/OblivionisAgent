import { Handle, Position, useStore, useNodeId } from "@xyflow/react";
import { useContext, type ReactNode } from "react";
import { NodeActionContext } from "../node-action-context.js";

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
  children,
}: {
  kind: string;
  icon: ReactNode;
  label: string;
  selected?: boolean;
  status?: string;
  hasTarget?: boolean;
  hasSource?: boolean;
  children?: ReactNode;
}) {
  // LOD：缩小到 <70% 时只留标题/状态条，不再画元数据(否则文字糊成一片)
  const zoom = useStore((s) => s.transform[2]);
  const lod = zoom < 0.7;
  // hover 快捷操作：复制 / 删除，缩太小(LOD)时不画，免得糊成一团
  const id = useNodeId();
  const { copyNode, deleteNode } = useContext(NodeActionContext);
  return (
    <div
      className={`xnode xnode-${kind} ${selected ? "selected" : ""} ${status ? `xn-${status}` : ""} ${
        lod ? "xn-lod" : ""
      }`}
    >
      {hasTarget && <Handle type="target" position={Position.Left} />}
      {!lod && id && (
        <div className="xnode-actions">
          <button
            className="xn-act"
            title="复制此节点"
            onClick={(e) => {
              e.stopPropagation();
              copyNode(id);
            }}
          >
            ⎘
          </button>
          <button
            className="xn-act danger"
            title="删除此节点及其连线"
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
        {status && <span className={`xnode-dot status-${status}`} title={status} />}
      </div>
      {!lod && children && <div className="xnode-body">{children}</div>}
      {hasSource && <Handle type="source" position={Position.Right} />}
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
