import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ClaudeStreamEvent } from "@oblivionis/shared";

/**
 * 转录持久化：把每个会话节点的 stream-json 事件落盘，GUI 重启后还能看到最近几天的访客会话过程。
 * - 目录：~/.oblivionis/transcripts/<nodeId>.jsonl，每行 {ts, event}
 * - 保留策略：RETENTION_MS(3天) + 每节点最多 MAX_EVENTS 条（内容不多，主要防极端膨胀）
 * - 压缩时机：启动加载时裁剪一次并重写文件；运行中只追加（追加便宜，重写贵）
 */
const RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 600;

interface StoredLine {
  ts: number;
  event: ClaudeStreamEvent;
}

export class TranscriptStore {
  private dir: string;
  /** 内存镜像：nodeId -> 最近事件（供新 GUI 连接时整包回放） */
  private cache = new Map<string, StoredLine[]>();

  constructor(baseDir = join(homedir(), ".oblivionis", "transcripts")) {
    this.dir = baseDir;
    try {
      mkdirSync(this.dir, { recursive: true });
    } catch {
      /* ignore */
    }
    this.loadAll();
  }

  /** 启动时加载全部节点的近期转录（裁剪过期/超量并回写） */
  private loadAll(): void {
    let files: string[] = [];
    try {
      files = readdirSync(this.dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      return;
    }
    const cutoff = Date.now() - RETENTION_MS;
    for (const f of files) {
      const nodeId = f.slice(0, -".jsonl".length);
      const p = join(this.dir, f);
      try {
        const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
        let items: StoredLine[] = [];
        for (const line of lines) {
          try {
            const o = JSON.parse(line) as StoredLine;
            if (o && typeof o.ts === "number" && o.event) items.push(o);
          } catch {
            /* 跳过坏行 */
          }
        }
        items = items.filter((x) => x.ts >= cutoff).slice(-MAX_EVENTS);
        if (items.length === 0) {
          // 整文件过期：删掉
          try {
            unlinkSync(p);
          } catch {
            /* ignore */
          }
          continue;
        }
        // 裁剪后的内容回写（启动时一次，运行中只追加）
        writeFileSync(p, items.map((x) => JSON.stringify(x)).join("\n") + "\n", "utf8");
        this.cache.set(nodeId, items);
      } catch {
        /* 单文件失败不影响其它 */
      }
    }
  }

  /** 追加一条事件（内存 + 落盘） */
  append(nodeId: string, event: ClaudeStreamEvent): void {
    if (!nodeId) return;
    const line: StoredLine = { ts: Date.now(), event };
    const arr = this.cache.get(nodeId) ?? [];
    arr.push(line);
    if (arr.length > MAX_EVENTS) arr.splice(0, arr.length - MAX_EVENTS);
    this.cache.set(nodeId, arr);
    try {
      // nodeId 是我们自己生成的 uuid，安全；仍过滤一下防路径注入
      const safe = nodeId.replace(/[^a-zA-Z0-9-]/g, "_");
      appendFileSync(join(this.dir, `${safe}.jsonl`), JSON.stringify(line) + "\n", "utf8");
    } catch {
      /* 落盘失败不影响主流程 */
    }
  }

  /** 全部节点的近期事件（给新连接的 GUI 整包回放） */
  histories(): Record<string, ClaudeStreamEvent[]> {
    const out: Record<string, ClaudeStreamEvent[]> = {};
    const cutoff = Date.now() - RETENTION_MS;
    for (const [nodeId, items] of this.cache) {
      const fresh = items.filter((x) => x.ts >= cutoff);
      if (fresh.length) out[nodeId] = fresh.map((x) => x.event);
    }
    return out;
  }

  /** 配置里已不存在的节点可清理（GUI 删节点后调用，非必须） */
  drop(nodeId: string): void {
    this.cache.delete(nodeId);
    try {
      unlinkSync(join(this.dir, `${nodeId.replace(/[^a-zA-Z0-9-]/g, "_")}.jsonl`));
    } catch {
      /* ignore */
    }
  }
}
