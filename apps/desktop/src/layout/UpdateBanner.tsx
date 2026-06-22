import { useCallback, useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useT } from "../i18n/index.js";

type Phase = "idle" | "available" | "downloading" | "ready" | "error";

/**
 * 自动更新条（只在主窗挂载一份）：开软件后台 check() 端点的 latest.json，有新版就提示；
 * 点「现在更新」下载签名过的新安装包并安装，完成后 relaunch()。无 Tauri / 无网络 / 无端点时静默不显示。
 * 也对外暴露 window 事件 "oblivionis:check-update" 供「设置 → 检查更新」手动触发。
 */
export function UpdateBanner() {
  const t = useT();
  const [upd, setUpd] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);
  const [manualEmpty, setManualEmpty] = useState(false); // 手动检查但已是最新

  const runCheck = useCallback(async (manual: boolean) => {
    try {
      const u = await check();
      if (u) {
        setUpd(u);
        setPhase("available");
      } else if (manual) {
        setManualEmpty(true);
        window.setTimeout(() => setManualEmpty(false), 3000);
      }
    } catch {
      /* 无 Tauri / 无网络 / 无端点 → 静默（手动时也不打扰，避免吓人） */
    }
  }, []);

  useEffect(() => {
    void runCheck(false); // 启动自动查一次
    const id = window.setInterval(() => void runCheck(false), 5 * 60 * 60 * 1000); // 之后每 5 小时自动查一次
    const onManual = () => void runCheck(true); // 设置里「检查更新」手动触发
    window.addEventListener("oblivionis:check-update", onManual);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("oblivionis:check-update", onManual);
    };
  }, [runCheck]);

  const doUpdate = useCallback(async () => {
    if (!upd) return;
    setPhase("downloading");
    setPct(0);
    try {
      let total = 0;
      let got = 0;
      await upd.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") {
          got += e.data.chunkLength;
          if (total) setPct(Math.min(99, Math.round((got / total) * 100)));
        } else if (e.event === "Finished") setPct(100);
      });
      setPhase("ready");
      await relaunch(); // 装完重启到新版
    } catch {
      setPhase("error");
    }
  }, [upd]);

  if (manualEmpty) {
    return <div className="update-banner ok">{t("已是最新版本 ✓")}</div>;
  }
  if (phase === "idle" || !upd) return null;

  return (
    <div className={`update-banner ${phase === "error" ? "err" : ""}`}>
      {phase === "available" && (
        <>
          <span className="ub-msg">
            🎉 {t("有新版本 v{0}", upd.version)}
            <span className="ub-cur">{t("当前 v{0}", upd.currentVersion)}</span>
          </span>
          <span className="ub-acts">
            <button className="ub-go" onClick={() => void doUpdate()}>
              {t("现在更新")}
            </button>
            <button className="ub-later" onClick={() => setPhase("idle")}>
              {t("稍后")}
            </button>
          </span>
        </>
      )}
      {phase === "downloading" && (
        <>
          <span className="ub-msg">{t("下载更新中… {0}%", pct)}</span>
          <span className="ub-bar">
            <span style={{ width: `${pct}%` }} />
          </span>
        </>
      )}
      {phase === "ready" && <span className="ub-msg">{t("即将重启以完成更新…")}</span>}
      {phase === "error" && (
        <>
          <span className="ub-msg">{t("更新失败，可到 GitHub 手动下载最新版")}</span>
          <span className="ub-acts">
            <button className="ub-later" onClick={() => setPhase("idle")}>
              {t("关闭")}
            </button>
          </span>
        </>
      )}
    </div>
  );
}
