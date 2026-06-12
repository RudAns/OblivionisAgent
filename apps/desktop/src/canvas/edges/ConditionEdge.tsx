import { useContext, useRef, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useStore, type EdgeProps } from "@xyflow/react";
import { EdgeActionContext } from "../edge-context.js";

/**
 * 带「意图条件徽标」+ hover 工具的连线：
 * - 有意图条件就显示条件文字(橙色)；source 是意图分流/路由但还没设条件就显示淡淡的「＋意图」。
 * - hover(或选中)连线时高亮线条，并在中点露出一个「×」一键删除按钮，不必右键。
 * 其它连线平时只画线，保持画布干净。
 */
export function ConditionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  target,
  markerEnd,
  style,
  data,
  selected,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.5,
  });
  const d = data as { condition?: string; sourceKind?: string } | undefined;
  const cond = (d?.condition ?? "").trim();
  const conditional = d?.sourceKind === "intent-switch" || d?.sourceKind === "route";
  const { editEdge, deleteEdge } = useContext(EdgeActionContext);

  // hover 状态带 60ms 延迟清除：从线条移到工具按钮的瞬间不闪烁
  const [hovered, setHovered] = useState(false);
  const clearT = useRef<number | undefined>(undefined);
  const enter = () => {
    if (clearT.current) window.clearTimeout(clearT.current);
    setHovered(true);
  };
  const leave = () => {
    clearT.current = window.setTimeout(() => setHovered(false), 60);
  };

  // 目标会话正在处理(running)时，让这条入边流动起来，直观看到"消息正流向哪个会话"
  const targetRunning = useStore((s) => {
    const n = s.nodeLookup.get(target);
    return (n?.data as { status?: string } | undefined)?.status === "running";
  });

  const active = hovered || selected;
  const showBadge = !!cond || conditional;
  const mergedStyle = active
    ? { ...style, stroke: "#7aa2ff", strokeWidth: 2.6 }
    : targetRunning
      ? { ...style, stroke: "#4f8cff" }
      : style;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={mergedStyle}
        interactionWidth={0}
        className={targetRunning ? "edge-flow" : undefined}
      />
      {/* 透明加宽路径：扩大 hover/点击命中区 */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onMouseEnter={enter}
        onMouseLeave={leave}
      />
      {(showBadge || active) && (
        <EdgeLabelRenderer>
          <div
            className="edge-tools"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onMouseEnter={enter}
            onMouseLeave={leave}
          >
            {showBadge && (
              <button
                className={`edge-badge ${cond ? "has-cond" : "no-cond"} ${selected ? "sel" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  editEdge(id);
                }}
                title={
                  cond ? `意图条件：${cond}（点击编辑）` : "点击设置触发意图（用于意图分流；留空=默认边）"
                }
              >
                {cond ? (cond.length > 16 ? cond.slice(0, 16) + "…" : cond) : "＋ 意图"}
              </button>
            )}
            {active && (
              <button
                className="edge-del"
                title="删除连线"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteEdge(id);
                }}
              >
                ×
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
