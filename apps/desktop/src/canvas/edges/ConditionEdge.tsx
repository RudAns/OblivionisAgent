import { useContext, useRef, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { EdgeActionContext } from "../edge-context.js";
import { EdgeRuntimeContext } from "../edge-runtime-context.js";
import { useT } from "../../i18n/index.js";

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
  targetHandleId,
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
  const t = useT();
  const { editEdge } = useContext(EdgeActionContext);

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
  const { activeEdges, focusEdges, edgeStats } = useContext(EdgeRuntimeContext);
  const flowing = activeEdges.has(id);
  const stat = edgeStats[id]; // C2 运行轨迹：该连线累计触发次数
  const count = stat?.count ?? 0;
  const dimmed = focusEdges != null && !focusEdges.has(id); // 选中节点时，不在其链路上的连线降透明

  const active = hovered || selected;
  // 只在有意图条件时显示标签(不再有重复的"＋意图"占位；加条件走右键菜单)
  const showBadge = !!cond;
  // 赋能类连线(人格/技能/子代理 → 会话)：不是消息"流动"，而是给会话"挂能力"。
  // → 用虚线 + 按节点类型上色(人格紫/技能青/子代理粉) + 不带箭头，和实线的消息流一眼区分。
  // 判定**优先用 targetHandleId==="fork"**：这是连线一等字段，只有 soul/skill/subagent 能连到
  // 会话的「人格/技能/子代理口」(isValidConnection 保证)，即便 data.sourceKind 没传到也稳判。
  // data.sourceKind 仅用于挑颜色(丢了就退回人格紫)。
  const capKind =
    d?.sourceKind === "soul" || d?.sourceKind === "skill" || d?.sourceKind === "subagent"
      ? d.sourceKind
      : undefined;
  const isCapability = capKind !== undefined || targetHandleId === "fork";
  const capColor =
    capKind === "skill" ? "#3a8fa0" : capKind === "subagent" ? "#c0517a" : "#8167b2";
  // 静息色用 CSS 变量：随 data-theme 在绘制时解析(浅色更深)，不依赖 React 重渲染时机
  const baseStyle = { ...style, stroke: "var(--edge-rest)", ...(dimmed ? { opacity: 0.22 } : null) };
  // 优先级：赋能虚线 > 群消息流动(橙色虚线动画) > hover/选中(蓝) > 静息
  const mergedStyle = isCapability
    ? {
        ...style,
        stroke: capColor,
        strokeWidth: active ? 2 : 1.5,
        strokeDasharray: "5 4",
        opacity: dimmed ? 0.22 : active ? 1 : 0.82,
      }
    : flowing
      ? { ...baseStyle, stroke: "#d96745", strokeWidth: 2.4, opacity: 1 } // 运行中：品牌橙，配 .edge-flow 虚线流动
      : active
        ? { ...baseStyle, stroke: "#4e6f9e", strokeWidth: 2.2, opacity: 1 } // 选中/hover：美术稿选中连线色
        : baseStyle;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={isCapability ? undefined : markerEnd}
        style={mergedStyle}
        interactionWidth={0}
        className={flowing && !isCapability ? "edge-flow" : undefined}
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
      {(showBadge || count > 0) && (
        <EdgeLabelRenderer>
          <div
            className="edge-tools"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              opacity: dimmed && !active ? 0.3 : 1,
            }}
            onMouseEnter={enter}
            onMouseLeave={leave}
          >
            {count > 0 && (
              <span
                title={
                  t("运行轨迹：已触发 {0} 次", count) +
                  (stat?.lastTs ? t(" · 最近 {0}", new Date(stat.lastTs).toLocaleString()) : "")
                }
                style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  borderRadius: 999,
                  background: "rgba(217,103,69,.12)",
                  color: "#b15532",
                  border: "1px solid rgba(217,103,69,.3)",
                  whiteSpace: "nowrap",
                }}
              >
                ▶ {count}
              </span>
            )}
            {showBadge && (
              <button
                className={`edge-badge has-cond ${selected ? "sel" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  editEdge(id);
                }}
                title={t("意图条件：{0}（点击编辑）", cond)}
              >
                {t("意图：{0}", cond.length > 12 ? cond.slice(0, 12) + "…" : cond)}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
