import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { summarizeCost, type CostEntry, type CostSnapshot } from "@oblivionis/shared";
import { useT } from "../i18n/index.js";
import { CostPanel } from "./CostPanel.js";

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * 成本看板（独立窗口，label="cost"）。读 ~/.oblivionis/costs.jsonl 的原始记录，
 * 用与引擎共用的 summarizeCost 聚合后渲染。独立窗口避免和主窗「选会话/切终端」抢面板。
 */
export function CostWindow() {
  const t = useT();
  const [cost, setCost] = useState<CostSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  // 主题跟随主窗（同源 localStorage）
  useEffect(() => {
    const stored = localStorage.getItem("oblivionis-theme") || "dark";
    const resolved =
      stored === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : stored;
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);

  const refresh = useCallback(async () => {
    if (!inTauri()) {
      setCost(summarizeCost([]));
      return;
    }
    setLoading(true);
    try {
      const entries = await invoke<CostEntry[]>("read_cost_entries");
      setCost(summarizeCost(entries));
    } catch {
      setCost(summarizeCost([]));
    } finally {
      setLoading(false);
    }
  }, []);

  // 每次 show/聚焦都刷新（文件快照，重开即新）
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    let un: (() => void) | undefined;
    if (inTauri()) {
      getCurrentWindow()
        .onFocusChanged(({ payload }) => payload && refreshRef.current())
        .then((u) => (un = u))
        .catch(() => {});
    }
    void refresh();
    return () => un?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="docwin">
      <div className="md-head" data-tauri-drag-region>
        <span className="md-title">📊 {t("成本看板")}</span>
        <span className="md-sub">{t("各会话 token 花费（数据来自每次运行的 cost_usd）")}</span>
        <span style={{ marginLeft: "auto" }}>
          <button className="md-open" onClick={() => void refresh()} disabled={loading}>
            {loading ? t("刷新中…") : t("刷新")}
          </button>
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <CostPanel cost={cost} />
      </div>
    </div>
  );
}
