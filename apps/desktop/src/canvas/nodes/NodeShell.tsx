import { Handle, Position } from "@xyflow/react";
import type { ReactNode } from "react";

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
  return (
    <div className={`xnode xnode-${kind} ${selected ? "selected" : ""}`}>
      {hasTarget && <Handle type="target" position={Position.Left} />}
      <div className="xnode-head">
        <span className="xnode-icon">{icon}</span>
        <span className="xnode-label" title={label}>
          {label}
        </span>
        {status && <span className={`xnode-dot status-${status}`} title={status} />}
      </div>
      {children && <div className="xnode-body">{children}</div>}
      {hasSource && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

/** 卡片主体的一行字段：左键名右值，值过长省略 */
export function Row({ k, v, dim }: { k: string; v: ReactNode; dim?: boolean }) {
  return (
    <div className={`xnode-row ${dim ? "dim" : ""}`}>
      <span className="xr-k">{k}</span>
      <span className="xr-v">{v}</span>
    </div>
  );
}

/** 路径类长值的截断显示（保尾部更有辨识度，如 cwd） */
export function tailTruncate(s: string | undefined, max = 26): string {
  if (!s) return "";
  return s.length <= max ? s : "…" + s.slice(-max);
}
