import { appendFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { CostSnapshot } from "@oblivionis/shared";

/**
 * 成本台账：每次「Claude 会话」运行完成（result 事件）记一行到 `~/.oblivionis/costs.jsonl`，
 * 聚合出「累计 / 今日花费、按会话节点、按天」给成本看板。stream-json 的 total_cost_usd 现成，
 * 一行一次运行、增长很慢；聚合时只读最近 MAX_READ_LINES 行。
 */
export interface CostEntry {
  ts: number;
  nodeId: string;
  label: string;
  model?: string;
  cost: number; // USD
  turns: number;
  durationMs: number;
  ctxTokens: number;
  outTokens: number;
}

const FILE = () => join(homedir(), ".oblivionis", "costs.jsonl");
const MAX_READ_LINES = 8000;

function dayStr(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export class CostLedger {
  private file = FILE();

  record(e: CostEntry): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      appendFileSync(this.file, JSON.stringify(e) + "\n", "utf8");
    } catch {
      /* 记账失败不影响主流程 */
    }
  }

  private read(): CostEntry[] {
    if (!existsSync(this.file)) return [];
    try {
      const lines = readFileSync(this.file, "utf8").split("\n").filter(Boolean).slice(-MAX_READ_LINES);
      const out: CostEntry[] = [];
      for (const l of lines) {
        try {
          out.push(JSON.parse(l) as CostEntry);
        } catch {
          /* 跳过坏行 */
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  summary(): CostSnapshot {
    const all = this.read();
    const todayStr = dayStr(Date.now());
    let total = 0;
    let today = 0;
    const perNode = new Map<string, CostSnapshot["perNode"][number]>();
    const daily = new Map<string, CostSnapshot["daily"][number]>();
    for (const e of all) {
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
      runs: all.length,
      perNode: [...perNode.values()].sort((a, b) => b.cost - a.cost),
      daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-14),
      recent: all.slice(-20).reverse(),
    };
  }
}
