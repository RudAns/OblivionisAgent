import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** 收集要脱敏的已知密钥：飞书 App Secret + 本机 ~/.claude/.credentials.json 里的令牌 */
export function collectSecrets(appSecret?: string): string[] {
  const set = new Set<string>();
  if (appSecret) set.add(appSecret);
  try {
    const p = join(homedir(), ".claude", ".credentials.json");
    if (existsSync(p)) collectStrings(JSON.parse(readFileSync(p, "utf8")), set);
  } catch {
    /* ignore */
  }
  return [...set].filter((s) => s.length >= 12);
}

/** 把文本里命中的密钥替换为 [REDACTED] */
export function redactText(text: string, secrets: string[]): string {
  let s = text;
  for (const sec of secrets) {
    if (sec && sec.length >= 8 && s.includes(sec)) s = s.split(sec).join("[REDACTED]");
  }
  return s;
}

/** 递归收集对象里所有 token 形字符串(>=12) */
function collectStrings(v: unknown, set: Set<string>): void {
  if (typeof v === "string") {
    if (v.length >= 12) set.add(v);
  } else if (Array.isArray(v)) {
    for (const x of v) collectStrings(x, set);
  } else if (v && typeof v === "object") {
    for (const k of Object.keys(v as Record<string, unknown>))
      collectStrings((v as Record<string, unknown>)[k], set);
  }
}
