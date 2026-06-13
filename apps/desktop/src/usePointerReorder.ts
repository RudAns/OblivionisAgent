import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * 指针拖拽排序（pointer 事件 + 指针捕获）。
 * HTML5 原生 draggable 在 Tauri/WebView2 里时灵时不灵，这套用 pointer 事件自己实现，稳。
 *
 * 用法：给每个可拖项 `{...itemProps(id, onClickWhenNotDragged)}`；落点判定靠 elementFromPoint
 * 命中带 data-reorder-id 的元素。子元素若不想触发拖拽（如关闭×按钮），加 data-noreorder。
 * onReorder(dragId, dropId) = 把 dragId 移到 dropId 之前。
 */
export function usePointerReorder(onReorder?: (dragId: string, dropId: string) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const overRef = useRef<string | null>(null); // 用 ref 读最新落点，避免 onPointerUp 闭包拿到旧 overId

  const reset = () => {
    dragRef.current = null;
    overRef.current = null;
    setDragId(null);
    setOverId(null);
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
      const over = el?.closest("[data-reorder-id]")?.getAttribute("data-reorder-id") ?? null;
      const next = over && over !== d.id ? over : null;
      overRef.current = next;
      setOverId(next);
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
          if (overRef.current && overRef.current !== d.id) onReorder?.(d.id, overRef.current);
        } else {
          onClick?.(); // 没拖动=普通点击
        }
      }
      reset();
    },
    onPointerCancel: () => reset(),
  });

  return { dragId, overId, itemProps };
}
