import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, emit } from "@tauri-apps/api/event";
import completeGif from "./assets/complete.gif";

/**
 * 「完成时提醒」小人弹窗的内容（跑在独立的透明无边框 alwaysOnTop 窗口里，main.tsx 按窗口
 * label==="mascot" 路由到这里渲染）。主窗口在任务完成且自己没聚焦时，定位+显示这个窗口并
 * 发 "mascot-show" 事件；这里播放从任务栏上缘弹出的动画，停留几秒缩回；点击则发
 * "mascot-clicked" 让主窗口聚焦并跳到那个完成的会话。
 */
export function Mascot() {
  const [shown, setShown] = useState(false);
  const [label, setLabel] = useState("");
  const nodeRef = useRef<string | undefined>(undefined);
  const hideT = useRef<number | undefined>(undefined);

  useEffect(() => {
    // 这个窗口必须透明：覆盖 styles.css 给 html/body/#root 的底色
    for (const el of [document.documentElement, document.body, document.getElementById("root")]) {
      if (el) (el as HTMLElement).style.background = "transparent";
    }
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    const hideWin = () => window.setTimeout(() => getCurrentWindow().hide().catch(() => {}), 400);

    let un: (() => void) | undefined;
    listen<{ nodeId?: string; label?: string }>("mascot-show", (e) => {
      nodeRef.current = e.payload?.nodeId;
      setLabel(e.payload?.label ?? "");
      setShown(true);
      if (hideT.current) window.clearTimeout(hideT.current);
      hideT.current = window.setTimeout(() => {
        setShown(false);
        hideWin();
      }, 4800);
    }).then((f) => (un = f));

    return () => {
      un?.();
      if (hideT.current) window.clearTimeout(hideT.current);
    };
  }, []);

  const onClick = () => {
    emit("mascot-clicked", { nodeId: nodeRef.current }).catch(() => {});
    if (hideT.current) window.clearTimeout(hideT.current);
    setShown(false);
    window.setTimeout(() => getCurrentWindow().hide().catch(() => {}), 220);
  };

  return (
    <div className={`mascot ${shown ? "in" : "out"}`} onClick={onClick} title="点我回到完成的会话">
      <div className="mascot-bubble">✅ 完成啦{label ? ` · ${label}` : ""}</div>
      <img className="mascot-gif" src={completeGif} alt="完成" draggable={false} />
    </div>
  );
}
