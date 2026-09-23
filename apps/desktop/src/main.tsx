import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App.js";
import { Mascot } from "./Mascot.js";
import { DocViewer } from "./panels/DocViewer.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { LangProvider } from "./i18n/index.js";
import "./styles.css";

// 禁用 webview 原生右键菜单（Reload / 检查 等）——只在「可编辑文本框」里保留（右键复制/粘贴有用）。
// 画布上的节点 / 连线 / 画板有各自的自定义右键菜单（onContextMenu 里已 preventDefault），不受影响。
window.addEventListener("contextmenu", (e) => {
  const el = e.target as Element | null;
  const editable =
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      (el as HTMLElement).isContentEditable === true ||
      !!el.closest?.("input, textarea, [contenteditable='true']"));
  if (!editable) e.preventDefault();
});

// index.html 这份打包驱动主窗 + 小人提醒窗(启动闪屏是独立的 splash.html，不走这里)，按 label 分流。
let label = "main";
try {
  if ("__TAURI_INTERNALS__" in window) label = getCurrentWindow().label;
} catch {
  /* 浏览器开发版没有 Tauri，按主窗口走 */
}

// 卡顿探针：JS 事件循环停顿 ≥1s 就报给 Rust 写进 ~/.oblivionis/ui-slow.log（和主线程心跳 MAIN-STALL 对照，
// 区分卡在"页面 JS/渲染进程"还是"宿主主线程"）。隐藏/最小化时浏览器会节流定时器(天然漂移)，不算；
// 可见性切换后重置基线，但刚恢复可见后的第一段停顿照记(=「从最小化回来卡」)。
if ("__TAURI_INTERNALS__" in window) {
  const report = (what: string, ms: number) => {
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("log_ui_stall", { what: `[${label}] ${what}`, ms: Math.round(ms) }))
      .catch(() => {});
  };
  const TICK = 250;
  let last = performance.now();
  let lastVisibleAt = document.hidden ? 0 : last;
  document.addEventListener("visibilitychange", () => {
    last = performance.now();
    if (!document.hidden) lastVisibleAt = last;
  });
  window.setInterval(() => {
    const now = performance.now();
    const lag = now - last - TICK;
    last = now;
    if (document.hidden || lag < 1000) return;
    const sinceVisible = now - lastVisibleAt;
    const ctx = sinceVisible < lag + 2000 ? "刚恢复可见" : document.hasFocus() ? "前台" : "可见未聚焦";
    report(`事件循环停顿(${ctx})`, lag);
  }, TICK);
  try {
    // 单个长任务(≥500ms)：能看到是脚本执行还是渲染/布局
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration >= 500) report(`longtask ${e.name}`, e.duration);
      }
    }).observe({ type: "longtask", buffered: false });
  } catch {
    /* 不支持 longtask 就只靠心跳 */
  }
}

// 透明「小人」窗：必须在**首帧之前**就把根背景设透明。WebView2 一旦用不透明背景
// （深色主题的 --bg）合成过首帧，之后 useEffect 再改透明也回不去 → 残留黑底
// （WebView2 运行时升级后这条变严，表现为"弹窗突然变黑"）。所以这里同步设，早于 React 渲染。
if (label === "mascot") {
  for (const el of [document.documentElement, document.body, document.getElementById("root")]) {
    if (el) (el as HTMLElement).style.background = "transparent";
  }
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <LangProvider>
    {label === "mascot" ? (
      <Mascot />
    ) : label === "mdviewer" ? (
      <ErrorBoundary>
        <DocViewer />
      </ErrorBoundary>
    ) : (
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    )}
  </LangProvider>,
);
