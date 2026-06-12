import { useContext } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { EdgeActionContext } from "../edge-context.js";

/**
 * 带"意图条件徽标"的连线：中点放一个可点击的小胶囊——
 * 有意图条件就显示条件文字(橙色)；source 是意图分流/路由但还没设条件就显示淡淡的「＋意图」。
 * 点徽标 = 打开连线条件编辑(不必再去点 2px 的细线)。其它连线只画线、不加徽标，保持干净。
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
  const conditional = d?.sourceKind === "intent-switch" || d?.sourceKind === "route";
  const { editEdge } = useContext(EdgeActionContext);
  const show = !!cond || conditional;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {show && (
        <EdgeLabelRenderer>
          <button
            className={`edge-badge ${cond ? "has-cond" : "no-cond"} ${selected ? "sel" : ""}`}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onClick={(e) => {
              e.stopPropagation();
              editEdge(id);
            }}
            title={
              cond
                ? `意图条件：${cond}（点击编辑）`
                : "点击设置触发意图（用于意图分流；留空=默认边）"
            }
          >
            {cond ? (cond.length > 16 ? cond.slice(0, 16) + "…" : cond) : "＋ 意图"}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
