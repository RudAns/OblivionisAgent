import type { CostSnapshot } from "./protocol.js";

/** 成本台账的一条记录（一次「Claude 会话」运行）。 */
export interface CostEntry {
  ts: number;
  nodeId: string;
  label: string;
  model?: string;
  cost: number;
  turns: number;
  durationMs: number;
  ctxTokens: number;
  outTokens: number;
}

function dayStr(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 把若干条记录聚合成成本看板汇总（累计 / 今日 / 按会话 / 按天 / 最近）。bridge 引擎与桌面成本窗共用。 */
export function summarizeCost(entries: CostEntry[]): CostSnapshot {
  const todayStr = dayStr(Date.now());
  let total = 0;
  let today = 0;
  const perNode = new Map<string, CostSnapshot["perNode"][number]>();
  const daily = new Map<string, CostSnapshot["daily"][number]>();
  for (const e of entries) {
    total += e.cost;
    const ds = dayStr(e.ts);
    if (ds === todayStr) today += e.cost;
    const pn = perNode.get(e.nodeId) ?? { nodeId: e.nodeId, label: e.label, cost: 0, runs: 0, lastTs: 0 };
    pn.cost += e.cost;
    pn.runs += 1;
    if (e.label) pn.label = e.label;
    if (e.ts > pn.lastTs) pn.lastTs = e.ts;
    perNode.set(e.nodeId, pn);
    const dd = daily.get(ds) ?? { day: ds, cost: 0, runs: 0 };
    dd.cost += e.cost;
    dd.runs += 1;
    daily.set(ds, dd);
  }
  return {
    total,
    today,
    runs: entries.length,
    perNode: [...perNode.values()].sort((a, b) => b.cost - a.cost),
    daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-14),
    recent: entries.slice(-20).reverse(),
  };
}
