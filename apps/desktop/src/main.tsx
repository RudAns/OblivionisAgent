import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App.js";
import { Mascot } from "./Mascot.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import "./styles.css";

// index.html 这份打包驱动主窗 + 小人提醒窗(启动闪屏是独立的 splash.html，不走这里)，按 label 分流。
let label = "main";
try {
  if ("__TAURI_INTERNALS__" in window) label = getCurrentWindow().label;
} catch {
  /* 浏览器开发版没有 Tauri，按主窗口走 */
}

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  label === "mascot" ? (
    <Mascot />
  ) : (
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  ),
);
