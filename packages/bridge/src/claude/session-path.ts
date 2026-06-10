import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

/**
 * claude 把 transcript 落在 ~/.claude/projects/<编码cwd>/<session-id>.jsonl
 * 编码规则(实测 claude 2.1.x)：绝对路径里所有非字母数字字符替换为 '-'。
 *   C:\Users\me\proj  ->  C--Users-me-proj
 */
export function encodeCwd(cwd: string): string {
  return resolve(cwd).replace(/[^a-zA-Z0-9]/g, "-");
}

export function transcriptPath(cwd: string, sessionId: string): string {
  return join(homedir(), ".claude", "projects", encodeCwd(cwd), `${sessionId}.jsonl`);
}

/** transcript 已存在 -> 续接(--resume)；否则 -> 新建并指定 id(--session-id) */
export function sessionArgs(cwd: string, sessionId: string): string[] {
  return existsSync(transcriptPath(cwd, sessionId))
    ? ["--resume", sessionId]
    : ["--session-id", sessionId];
}
