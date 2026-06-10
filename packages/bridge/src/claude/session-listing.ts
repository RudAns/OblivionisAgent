import { readdirSync, statSync, openSync, readSync, fstatSync, closeSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SessionInfo } from "@oblivionis/shared";
import { encodeCwd } from "./session-path.js";

/**
 * 列出某工作目录(cwd)下的所有 Claude 会话(~/.claude/projects/<编码cwd>/*.jsonl)，
 * 附第一条用户消息预览，便于人工辨认要 fork 的"角色管线"会话。
 */
export function listSessions(cwd: string): SessionInfo[] {
  if (!cwd) return [];
  const dir = join(homedir(), ".claude", "projects", encodeCwd(cwd));
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const items: SessionInfo[] = [];
  for (const f of files) {
    const full = join(dir, f);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    items.push({
      id: f.replace(/\.jsonl$/, ""),
      mtime: st.mtimeMs,
      sizeBytes: st.size,
      preview: firstUserText(full),
    });
  }
  items.sort((a, b) => b.mtime - a.mtime);
  return items;
}

/** 只读文件前缀，找第一条用户消息文本（大文件也快） */
function firstUserText(path: string): string {
  let out = "";
  try {
    const fd = openSync(path, "r");
    try {
      const size = fstatSync(fd).size;
      const len = Math.min(size, 262144);
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, 0);
      for (const line of buf.toString("utf8").split("\n")) {
        const t = line.trim();
        if (!t) continue;
        let obj: any;
        try {
          obj = JSON.parse(t);
        } catch {
          continue;
        }
        if (obj?.type === "user" && obj?.message?.role === "user") {
          const c = obj.message.content;
          let s = "";
          if (typeof c === "string") s = c;
          else if (Array.isArray(c))
            s = c
              .filter((b: any) => b?.type === "text" && typeof b.text === "string")
              .map((b: any) => b.text)
              .join(" ");
          s = s.trim();
          if (s && !s.startsWith("<")) {
            out = s;
            break;
          }
        }
      }
    } finally {
      closeSync(fd);
    }
  } catch {
    /* ignore */
  }
  return out.slice(0, 100);
}
