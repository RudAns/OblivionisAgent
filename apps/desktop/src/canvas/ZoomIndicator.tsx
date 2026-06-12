import { Panel, useStore, useReactFlow } from "@xyflow/react";

/** 右上角缩放指示器：显示当前缩放%，点百分比恢复 100%，±按钮微调。 */
export function ZoomIndicator() {
  const zoom = useStore((s) => s.transform[2]);
  const rf = useReactFlow();
  return (
    <Panel position="top-right" className="zoom-indicator">
      <button className="zoom-btn" title="缩小" onClick={() => rf.zoomOut({ duration: 150 })}>
        －
      </button>
      <button className="zoom-pct" title="恢复 100%" onClick={() => rf.zoomTo(1, { duration: 200 })}>
        {Math.round(zoom * 100)}%
      </button>
      <button className="zoom-btn" title="放大" onClick={() => rf.zoomIn({ duration: 150 })}>
        ＋
      </button>
    </Panel>
  );
}
