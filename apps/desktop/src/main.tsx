import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App.js";
import { Mascot } from "./Mascot.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import "./styles.css";

// 同一份打包同时驱动主窗口和「完成时提醒」小人窗口，按当前窗口 label 分流渲染。
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
