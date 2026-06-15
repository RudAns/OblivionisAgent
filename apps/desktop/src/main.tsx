import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App.js";
import { Mascot } from "./Mascot.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import "./styles.css";

// 同一份打包驱动多个窗口(主窗 / 小人提醒 / 启动闪屏)，按当前窗口 label 分流渲染。
let label = "main";
try {
  if ("__TAURI_INTERNALS__" in window) label = getCurrentWindow().label;
} catch {
  /* 浏览器开发版没有 Tauri，按主窗口走 */
}

// 只有「闪屏窗」保留 index.html 里的 #splash 当内容；其它窗口立刻把它抠掉。
if (label !== "splashscreen") document.getElementById("splash")?.remove();

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  label === "splashscreen" ? (
    <></> // 闪屏窗不挂 React，纯静态 #splash 显示
  ) : label === "mascot" ? (
    <Mascot />
  ) : (
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  ),
);
