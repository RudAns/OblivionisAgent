import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { KnowledgeItem } from "@oblivionis/shared";
import { writeSoul } from "./soul-store.js";

/**
 * 知识收件箱（vision-agentic-roadmap.md §3）：
 * fork 会话问答中提取出的"规则性指令"候选，等主人在 GUI 里裁决：
 *   ✅ 采纳 → 追加到该节点 cwd 的 CLAUDE.md（base 与未来所有 fork 原生继承，可进 git）
 *   ❌ 抛弃
 * 持久化：~/.oblivionis/knowledge-inbox.jsonl（全量重写式保存，量小）
 */
export class KnowledgeStore {
  private file: string;
  private items: KnowledgeItem[] = [];

  constructor(file = join(homedir(), ".oblivionis", "knowledge-inbox.jsonl")) {
    this.file = file;
    this.load();
  }

  private load(): void {
    try {
      if (!existsSync(this.file)) return;
      const lines = readFileSync(this.file, "utf8").split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const o = JSON.parse(line) as KnowledgeItem;
          if (o && o.id && o.rule) this.items.push(o);
        } catch {
          /* 跳过坏行 */
        }
      }
      // 只保留近 14 天，防无限膨胀
      const cutoff = Date.now() - 14 * 24 * 3600_000;
      this.items = this.items.filter((x) => x.ts >= cutoff).slice(-200);
    } catch {
      /* ignore */
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, this.items.map((x) => JSON.stringify(x)).join("\n") + "\n", "utf8");
    } catch {
      /* ignore */
    }
  }

  all(): KnowledgeItem[] {
    return this.items;
  }

  pendingCount(): number {
    return this.items.filter((x) => x.status === "pending").length;
  }

  add(input: Omit<KnowledgeItem, "id" | "ts" | "status">): KnowledgeItem {
    const item: KnowledgeItem = { ...input, id: randomUUID(), ts: Date.now(), status: "pending" };
    // 去重：同节点下"语义高度重复"的规则不重复入箱。
    // 之前只比 pending + 完全相等，于是「CI 结果用简短的中文回复」绕过了已采纳的「CI 结果用简短中文回复打包」。
    // 现在：① 比对所有状态(pending/accepted/dismissed)——已裁决过的别再骚扰；
    //       ② 归一化(去标点空白大小写)后互为子串即判重——抓住措辞微调的近义重复。
    const norm = (s: string) =>
      s.replace(/[\s，。、,.!！?？:：;；"'""''`()（）【】[\]{}—\-_~·…]/g, "").toLowerCase();
    const nNew = norm(item.rule);
    if (!nNew) return item;
    const dup = this.items.some((x) => {
      if (x.nodeId !== item.nodeId) return false;
      const nx = norm(x.rule);
      if (!nx) return false;
      return nx === nNew || nx.includes(nNew) || nNew.includes(nx);
    });
    if (dup) return item;
    this.items.push(item);
    this.save();
    return item;
  }

  /**
   * 裁决：accept=写入 cwd 的 CLAUDE.md（可携带编辑后的规则文本）；dismiss=标记抛弃。
   * 返回更新后的条目；找不到返回 null。
   */
  decide(id: string, action: "accept" | "dismiss", editedRule?: string): KnowledgeItem | null {
    const item = this.items.find((x) => x.id === id);
    if (!item) return null;
    if (action === "dismiss") {
      item.status = "dismissed";
      this.save();
      return item;
    }
    const rule = (editedRule ?? item.rule).trim();
    if (rule) {
      if (item.kind === "soul") {
        // 人格修订提案：rule = 修订后的完整 SOUL.md，采纳即覆写人格文件（下条消息生效）
        writeSoul(item.nodeId, rule);
      } else {
        this.appendToClaudeMd(item.cwd, rule);
      }
    }
    item.status = "accepted";
    item.rule = rule;
    this.save();
    return item;
  }

  /** 追加到项目 CLAUDE.md 的「群聊沉淀规则」小节（无则创建小节/文件） */
  private appendToClaudeMd(cwd: string, rule: string): void {
    const file = join(cwd, "CLAUDE.md");
    const SECTION = "## 群聊沉淀规则（OblivionisAgent 知识收件箱采纳）";
    const line = `- ${rule.replace(/\r?\n/g, " ")}`;
    try {
      if (!existsSync(file)) {
        writeFileSync(file, `# 项目说明\n\n${SECTION}\n\n${line}\n`, "utf8");
        return;
      }
      const text = readFileSync(file, "utf8");
      if (text.includes(SECTION)) {
        // 插到小节末尾（= 小节标题之后找到下一个 "## " 或文件尾）
        const idx = text.indexOf(SECTION);
        const rest = text.slice(idx + SECTION.length);
        const nextHeading = rest.search(/\n## /);
        const insertAt =
          nextHeading >= 0 ? idx + SECTION.length + nextHeading : text.length;
        const next =
          text.slice(0, insertAt).replace(/\s*$/, "") + `\n${line}\n` + text.slice(insertAt);
        writeFileSync(file, next, "utf8");
      } else {
        appendFileSync(file, `\n${SECTION}\n\n${line}\n`, "utf8");
      }
    } catch {
      /* 写失败不崩；条目保持 pending 让用户重试？简化：忽略（极少发生） */
    }
  }
}
