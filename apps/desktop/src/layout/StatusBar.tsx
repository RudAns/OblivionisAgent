import { useT } from "../i18n/index.js";

interface CtxInfo {
  ctxTokens: number;
  outTokens: number;
  model: string;
}
interface Props {
  bridgeUp: boolean;
  sessionCount: number;
  openTerminals: number;
  activeLabel: string | null;
  /** 当前终端会话的上下文体量估算（读 transcript，不耗 token）；null=暂无 */
  ctx?: CtxInfo | null;
  /** 鼠标移到终端名上时刷新一次 ctx */
  onCtxHover?: () => void;
  /** 刚自动保存过 → 短暂显示"已保存 ✓" */
  saved?: boolean;
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(0) + "k";
  return String(n);
}

/** 底部状态栏（参考专业 IDE）：后台服务状态、会话统计、当前终端（悬停看上下文用量）、自动保存提示 */
export function StatusBar({ bridgeUp, sessionCount, openTerminals, activeLabel, ctx, onCtxHover, saved }: Props) {
  const t = useT();
  // 上下文窗口按模型粗判：Opus 4.x 是 1M，其余按 200k（仅用于百分比展示）
  const win = ctx && /opus/i.test(ctx.model) ? 1_000_000 : 200_000;
  const pct = ctx ? Math.min(100, Math.round((ctx.ctxTokens / win) * 100)) : 0;
  return (
    <footer className="statusbar">
      {/* 服务就绪是常态，无需常驻提示；只有还没就绪(启动中/掉线)才显示 */}
      {!bridgeUp && (
        <span
          className="sb-item sb-bridge down"
          title={t("本软件的后台服务（随应用自动启动，负责飞书收发与会话调度）")}
        >
          <span className="sb-dot" />
          {t("正在启动后台服务…")}
        </span>
      )}
      <span className="sb-flex" />
      {activeLabel && (
        <span className="sb-item sb-term" title={t("当前终端 · 悬停看上下文用量")} onMouseEnter={() => onCtxHover?.()}>
          ⌨ {activeLabel}
          {ctx && <span className="sb-ctx-mini">{pct}%</span>}
          {ctx && (
            <span className="sb-ctx-pop">
              <div className="sb-ctx-h">{t("上下文用量（估算）")}</div>
              <div className="sb-ctx-num">
                {fmtK(ctx.ctxTokens)} / {fmtK(win)} <b>({pct}%)</b>
              </div>
              <div className="sb-ctx-bar">
                <span className={pct >= 85 ? "hot" : pct >= 60 ? "warm" : ""} style={{ width: `${pct}%` }} />
              </div>
              <div className="sb-ctx-sub">
                {t("上次回合输出 {0} · 读 transcript 估算，不耗 token", fmtK(ctx.outTokens))}
              </div>
            </span>
          )}
        </span>
      )}
      <span className="sb-item" title={t("画布上的 Claude 会话节点数 / 已打开的终端数")}>
        {t("会话 {0} · 终端 {1}", sessionCount, openTerminals)}
      </span>
      <span className={`sb-item dim ${saved ? "sb-saved" : ""}`}>
        {saved ? t("已保存 ✓") : t("改动自动保存")}
      </span>
      <span className="sb-item dim">v0.2.0</span>
    </footer>
  );
}
