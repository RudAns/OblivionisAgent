import { useT } from "../i18n/index.js";

interface CtxInfo {
  ctxTokens: number;
  outTokens: number;
  model: string;
  /** 基线开销(系统提示+工具+记忆+技能+首条)，用于把上下文粗分成「固定开销」vs「对话消息」 */
  baseTokens: number;
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
  /** 本软件版本号（来自 app_version=CARGO_PKG_VERSION）；缺省回退编译期常量，避免再写死过时 */
  version?: string;
}

const APP_VERSION = "0.3.0";

function fmtK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(n >= 100_000 ? 0 : 1) + "k";
  return String(n);
}

/** "claude-opus-4-8" → "Opus 4.8"，认不出就回退原串 */
function prettyModel(id: string): string {
  const m = /claude-(opus|sonnet|haiku|fable)-(\d+)-?(\d+)?/i.exec(id || "");
  if (!m) return id || "—";
  const fam0 = m[1] ?? "";
  const fam = fam0.charAt(0).toUpperCase() + fam0.slice(1);
  return `${fam} ${m[2] ?? ""}${m[3] ? "." + m[3] : ""}`;
}

/** 底部状态栏（参考专业 IDE）：后台服务状态、会话统计、当前终端（悬停看上下文用量）、自动保存提示 */
export function StatusBar({ bridgeUp, sessionCount, openTerminals, activeLabel, ctx, onCtxHover, saved, version }: Props) {
  const t = useT();
  // 上下文窗口按模型粗判：Opus 4.x 是 1M，其余按 200k（仅用于百分比展示）
  const win = ctx && /opus/i.test(ctx.model) ? 1_000_000 : 200_000;
  const pct = ctx ? Math.min(100, Math.round((ctx.ctxTokens / win) * 100)) : 0;
  // 把已用上下文粗分成「固定开销(基线)」与「对话消息」，空闲=窗口-已用
  const overhead = ctx ? Math.min(ctx.baseTokens, ctx.ctxTokens) : 0;
  const messages = ctx ? Math.max(0, ctx.ctxTokens - overhead) : 0;
  const free = ctx ? Math.max(0, win - ctx.ctxTokens) : 0;
  const overPct = ctx ? (overhead / win) * 100 : 0;
  const msgPct = ctx ? (messages / win) * 100 : 0;
  const fillClass = pct >= 85 ? "hot" : pct >= 60 ? "warm" : "";
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
          {ctx && <span className={`sb-ctx-mini ${fillClass}`}>{pct}%</span>}
          {ctx && (
            <span className="sb-ctx-pop">
              <div className="sb-ctx-h">
                {t("上下文用量（估算）")}
                <span className="sb-ctx-model">{prettyModel(ctx.model)}</span>
              </div>
              <div className="sb-ctx-num">
                {fmtK(ctx.ctxTokens)}
                <span className="sb-ctx-win"> / {fmtK(win)}</span>
                <b className={fillClass}>{pct}%</b>
              </div>
              <div className="sb-ctx-seg">
                <span className="seg-over" style={{ width: `${overPct}%` }} />
                <span className={`seg-msg ${fillClass}`} style={{ width: `${msgPct}%` }} />
              </div>
              <div className="sb-ctx-legs">
                <span className="sb-ctx-leg">
                  <i className="d-over" />
                  {t("固定开销")}
                  <b>{fmtK(overhead)}</b>
                </span>
                <span className="sb-ctx-leg">
                  <i className="d-msg" />
                  {t("对话消息")}
                  <b>{fmtK(messages)}</b>
                </span>
                <span className="sb-ctx-leg">
                  <i className="d-free" />
                  {t("空闲")}
                  <b>{fmtK(free)}</b>
                </span>
              </div>
              {pct >= 85 && <div className="sb-ctx-warn">{t("接近自动压缩，建议尽快 /compact 控制保留内容")}</div>}
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
      <span className="sb-item dim">v{version || APP_VERSION}</span>
    </footer>
  );
}
