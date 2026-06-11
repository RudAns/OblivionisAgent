import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * 群记忆（GROUP.md，vision-agentic-roadmap.md §3 轨道一）：
 * 每个飞书群一份带硬字符配额的记忆文件，注入到该群会话的 system prompt，让机器人"记得这个群"。
 *
 * 设计照抄 Hermes 的 MEMORY.md：极小 + 整流压缩，不要无限膨胀。
 * 写入由"问答后反思"(distill-memory.ts)发起——不走 MCP 工具(避免每条消息 spawn 重 exe)。
 */
const BUDGET = 1500; // 字符上限（约 ~550 token），逼模型压缩而非堆积
const DIR = () => join(homedir(), ".oblivionis", "groups");

function memPath(chatId: string): string {
  const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(DIR(), `${safe}.md`);
}

/** 读取某群记忆（注入用）；不存在/空返回 undefined */
export function readGroupMemory(chatId: string): string | undefined {
  if (!chatId) return undefined;
  try {
    const p = memPath(chatId);
    if (!existsSync(p)) return undefined;
    const t = readFileSync(p, "utf8").trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

/** 覆写某群记忆（反思产出落点）；超配额截断保护 */
export function writeGroupMemory(chatId: string, content: string): void {
  if (!chatId) return;
  try {
    mkdirSync(DIR(), { recursive: true });
    let body = content.trim();
    if (body.length > BUDGET) body = body.slice(0, BUDGET);
    writeFileSync(memPath(chatId), body + "\n", "utf8");
  } catch {
    /* 记忆写失败不影响主流程 */
  }
}

/** 确保群记忆文件存在（无则建空模板，供 GUI 编辑/查看），返回路径 */
export function ensureGroupMemory(chatId: string): string {
  const p = memPath(chatId);
  try {
    mkdirSync(DIR(), { recursive: true });
    if (!existsSync(p)) {
      writeFileSync(
        p,
        `# 群记忆（机器人对本群积累的长期记忆，会自动维护，你也可手动编辑）\n# 上限约 ${BUDGET} 字符\n\n`,
        "utf8",
      );
    }
  } catch {
    /* ignore */
  }
  return p;
}

export const GROUP_MEMORY_BUDGET = BUDGET;
