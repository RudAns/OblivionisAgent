import { useContext, useRef, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { EdgeActionContext } from "../edge-context.js";
import { EdgeRuntimeContext } from "../edge-runtime-context.js";

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

  // 运行时：该连线在"正被处理的链路"上时整条流动起来（上游回溯，见 EdgeRuntimeContext）
  const { activeEdges } = useContext(EdgeRuntimeContext);
  const flowing = activeEdges.has(id);

  const active = hovered || selected;
  // 只在有意图条件时显示标签(不再有重复的"＋意图"占位；加条件走右键菜单)
  const showBadge = !!cond;
  const mergedStyle = active
    ? { ...style, stroke: "#4e6f9e", strokeWidth: 2.2 } // 选中/hover：美术稿选中连线色
    : flowing
      ? { ...style, stroke: "#6f86a8", strokeWidth: 2.2 }
      : style;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={mergedStyle}
        interactionWidth={0}
        className={flowing ? "edge-flow" : undefined}
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
                className={`edge-badge has-cond ${selected ? "sel" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  editEdge(id);
                }}
                title={`意图条件：${cond}（点击编辑）`}
              >
                意图：{cond.length > 12 ? cond.slice(0, 12) + "…" : cond}
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
