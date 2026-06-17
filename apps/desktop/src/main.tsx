import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App.js";
import { Mascot } from "./Mascot.js";
import { DocViewer } from "./panels/DocViewer.js";
import { CostWindow } from "./panels/CostWindow.js";
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

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <LangProvider>
    {label === "mascot" ? (
      <Mascot />
    ) : label === "mdviewer" ? (
      <ErrorBoundary>
        <DocViewer />
      </ErrorBoundary>
    ) : label === "cost" ? (
      <ErrorBoundary>
        <CostWindow />
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
