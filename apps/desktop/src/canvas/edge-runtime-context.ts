import { createContext } from "react";

/**
 * 运行时高亮：当前正在被处理的链路上的连线 id 集合。
 * 某会话节点 status=running 时，从它沿入边一路回溯到源头的所有连线都算"在流动"，
 * ConditionEdge 据此放流线动画 —— 就像很多 FlowCanvas 编辑器的运行时调试视图。
 */
export const EdgeRuntimeContext = createContext<{
  activeEdges: Set<string>;
  /** 选中某节点时，它上下游链路上的连线 id；其它连线降透明度。null=未聚焦 */
  focusEdges: Set<string> | null;
}>({
  activeEdges: new Set(),
  focusEdges: null,
});
