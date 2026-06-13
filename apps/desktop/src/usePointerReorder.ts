import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * 指针拖拽排序（pointer 事件 + 指针捕获）。
 * HTML5 原生 draggable 在 Tauri/WebView2 里时灵时不灵，这套用 pointer 事件自己实现，稳。
 *
 * 用法：给每个可拖项 `{...itemProps(id, onClickWhenNotDragged)}` + `className 含 dropClass(id)`。
 * 落点用 elementFromPoint 命中带 data-reorder-id 的元素，再按指针在目标的前/后半决定插哪边
 * （所以能拖到列表最末/最前）。子元素不想触发拖拽（如关闭×）加 data-noreorder。
 * onReorder(dragId, dropId, after) = 把 dragId 移到 dropId 的之前(after=false)或之后(after=true)。
 */
export function usePointerReorder(
  onReorder?: (dragId: string, dropId: string, after: boolean) => void,
  orientation: "horizontal" | "vertical" = "vertical",
) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const dragRef = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const dropRef = useRef<{ id: string; after: boolean } | null>(null); // ref 读最新落点，避免闭包旧值

  const reset = () => {
    dragRef.current = null;
    dropRef.current = null;
    setDragId(null);
    setDrop(null);
  };

  const itemProps = (id: string, onClick?: () => void) => ({
    "data-reorder-id": id,
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return; // 仅左键
      if ((e.target as HTMLElement).closest("[data-noreorder]")) return; // 点在不可拖的子元素上
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragRef.current = { id, x: e.clientX, y: e.clientY, moved: false };
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return; // 超过 5px 才算拖
        d.moved = true;
        setDragId(d.id);
      }
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const target = el?.closest("[data-reorder-id]") as HTMLElement | null;
      const overId = target?.getAttribute("data-reorder-id") ?? null;
      if (!overId || overId === d.id || !target) {
        dropRef.current = null;
        setDrop(null);
        return;
      }
      const r = target.getBoundingClientRect();
      const after =
        orientation === "horizontal"
          ? e.clientX > r.left + r.width / 2
          : e.clientY > r.top + r.height / 2;
      const next = { id: overId, after };
      dropRef.current = next;
      setDrop((prev) => (prev && prev.id === next.id && prev.after === next.after ? prev : next));
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const d = dragRef.current;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (d) {
        if (d.moved) {
          const dp = dropRef.current;
          if (dp && dp.id !== d.id) onReorder?.(d.id, dp.id, dp.after);
        } else {
          onClick?.(); // 没拖动=普通点击
        }
      }
      reset();
    },
    onPointerCancel: () => reset(),
  });

  /** 该项当前要画的插入线 class：drop-before(线在它前面) / drop-after(线在它后面) / "" */
  const dropClass = (id: string) =>
    drop && drop.id === id ? (drop.after ? "drop-after" : "drop-before") : "";

  return { dragId, dropClass, itemProps };
}
