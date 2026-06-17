import { appendFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { summarizeCost, type CostEntry, type CostSnapshot } from "@oblivionis/shared";

/**
 * 成本台账：每次「Claude 会话」运行完成（result 事件）记一行到 `~/.oblivionis/costs.jsonl`，
 * 聚合出「累计 / 今日花费、按会话节点、按天」给成本看板（聚合逻辑共用 shared 的 summarizeCost，
 * 桌面成本窗也用同一份）。一行一次运行、增长很慢；聚合时只读最近 MAX_READ_LINES 行。
 */
const FILE = () => join(homedir(), ".oblivionis", "costs.jsonl");
const MAX_READ_LINES = 8000;

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
    return summarizeCost(this.read());
  }
}
