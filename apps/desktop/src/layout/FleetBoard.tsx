import type { CostSnapshot } from "@oblivionis/shared";
import { useT } from "../i18n/index.js";

export interface FleetLoop {
  id: string;
  label: string;
}
export type LoopProgressMap = Record<string, { round: number; max: number; running: boolean; note?: string }>;

/**
 * 「循环舰队」看板：主窗仪表盘里一块实时板，列出每个 🔁 循环节点的状态（运行中第几轮 / 空闲 / 上次停因）、
 * 累计花费，并一键 跑 / 继续 / 强制中断。数据全来自已有广播（loop-progress + cost-summary），
 * 控制复用已有的 run-loop / continue-loop / stop-loop。没有循环节点时不渲染（return null）。
 */
export function FleetBoard({
  loops,
  progress,
  cost,
  onRun,
  onStop,
  onContinue,
}: {
  loops: FleetLoop[];
  progress: LoopProgressMap;
  cost: CostSnapshot | null;
  onRun: (id: string) => void;
  onStop: (id: string) => void;
  onContinue: (id: string) => void;
}) {
  const t = useT();
  if (!loops.length) return null;
  const costOf = (id: string) => cost?.perNode?.find((p) => p.nodeId === id)?.cost ?? 0;
  const runningCount = loops.filter((l) => progress[l.id]?.running).length;

  return (
    <div className="dash-card fleet-card">
      <div className="dash-card-h">
        <span className="dch-title">🔁 {t("循环舰队")}</span>
        <span className="dch-sub">{runningCount ? t("{0} 个在跑", runningCount) : t("全部空闲")}</span>
      </div>
      <div className="fleet-rows">
        {loops.map((l) => {
          const p = progress[l.id];
          const running = !!p?.running;
          const c = costOf(l.id);
          return (
            <div key={l.id} className={`fleet-row ${running ? "run" : ""}`}>
              <span className="fleet-name" title={l.label}>
                {l.label}
              </span>
              <span className={`fleet-stat ${running ? "on" : ""}`} title={p?.note ?? ""}>
                {running
                  ? t("运行中 · 第 {0}/{1} 轮", p!.round, p!.max)
                  : p?.note
                    ? p.note
                    : t("待命")}
              </span>
              {c > 0 && <span className="fleet-cost">${c.toFixed(3)}</span>}
              <span className="fleet-act">
                {running ? (
                  <button className="fleet-btn danger" onClick={() => onStop(l.id)} title={t("强制中断")}>
                    ⏹
                  </button>
                ) : (
                  <>
                    <button className="fleet-btn" onClick={() => onRun(l.id)} title={t("跑一次")}>
                      ▶
                    </button>
                    <button className="fleet-btn" onClick={() => onContinue(l.id)} title={t("继续")}>
                      ⏵
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
