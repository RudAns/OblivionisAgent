import type { Node, NodePositionChange, XYPosition } from "@xyflow/react";

export type HelperLinesResult = {
  horizontal?: number;
  vertical?: number;
  snapPosition: Partial<XYPosition>;
};

/**
 * 拖动节点时计算对齐参考线（移植自 React Flow 官方 helper-lines 示例）。
 * 把被拖节点 A 的六条边（左/右/中=略，这里用左右上下）与其它节点 B 的边逐一比距离，
 * 落在 distance(px) 内就吸附，并返回该对齐线在「画布坐标」下的 x/y，供 overlay 画线。
 */
export function getHelperLines(change: NodePositionChange, nodes: Node[], distance = 5): HelperLinesResult {
  const defaultResult: HelperLinesResult = {
    horizontal: undefined,
    vertical: undefined,
    snapPosition: { x: undefined, y: undefined },
  };
  const nodeA = nodes.find((n) => n.id === change.id);
  if (!nodeA || !change.position) return defaultResult;

  const aw = nodeA.measured?.width ?? 0;
  const ah = nodeA.measured?.height ?? 0;
  const a = {
    left: change.position.x,
    right: change.position.x + aw,
    top: change.position.y,
    bottom: change.position.y + ah,
    width: aw,
    height: ah,
  };

  let hDist = distance; // 横向对齐(上/下边)允许误差
  let vDist = distance; // 纵向对齐(左/右边)允许误差

  return nodes
    .filter((n) => n.id !== nodeA.id)
    .reduce<HelperLinesResult>((result, nodeB) => {
      const bw = nodeB.measured?.width ?? 0;
      const bh = nodeB.measured?.height ?? 0;
      const b = {
        left: nodeB.position.x,
        right: nodeB.position.x + bw,
        top: nodeB.position.y,
        bottom: nodeB.position.y + bh,
      };

      // —— 纵向参考线（左右边对齐）——
      const leftLeft = Math.abs(a.left - b.left);
      if (leftLeft < vDist) {
        result.snapPosition.x = b.left;
        result.vertical = b.left;
        vDist = leftLeft;
      }
      const rightRight = Math.abs(a.right - b.right);
      if (rightRight < vDist) {
        result.snapPosition.x = b.right - a.width;
        result.vertical = b.right;
        vDist = rightRight;
      }
      const leftRight = Math.abs(a.left - b.right);
      if (leftRight < vDist) {
        result.snapPosition.x = b.right;
        result.vertical = b.right;
        vDist = leftRight;
      }
      const rightLeft = Math.abs(a.right - b.left);
      if (rightLeft < vDist) {
        result.snapPosition.x = b.left - a.width;
        result.vertical = b.left;
        vDist = rightLeft;
      }

      // —— 横向参考线（上下边对齐）——
      const topTop = Math.abs(a.top - b.top);
      if (topTop < hDist) {
        result.snapPosition.y = b.top;
        result.horizontal = b.top;
        hDist = topTop;
      }
      const bottomBottom = Math.abs(a.bottom - b.bottom);
      if (bottomBottom < hDist) {
        result.snapPosition.y = b.bottom - a.height;
        result.horizontal = b.bottom;
        hDist = bottomBottom;
      }
      const topBottom = Math.abs(a.top - b.bottom);
      if (topBottom < hDist) {
        result.snapPosition.y = b.bottom;
        result.horizontal = b.bottom;
        hDist = topBottom;
      }
      const bottomTop = Math.abs(a.bottom - b.top);
      if (bottomTop < hDist) {
        result.snapPosition.y = b.top - a.height;
        result.horizontal = b.top;
        hDist = bottomTop;
      }

      return result;
    }, defaultResult);
}
