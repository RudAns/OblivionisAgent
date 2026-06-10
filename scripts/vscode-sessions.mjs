// 从 VSCode 工作区 SQLite 读出 Claude Code 扩展的会话列表（含你的重命名 + sessionId）。
// 用法: node --experimental-sqlite scripts/vscode-sessions.mjs <state.vscdb 路径>
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, rmSync } from "node:fs";

const src = process.argv[2];
if (!src) {
  console.error("用法: node --experimental-sqlite scripts/vscode-sessions.mjs <state.vscdb>");
  process.exit(1);
}
const tmp = src + ".oblivionis-tmp";
copyFileSync(src, tmp); // 复制避免锁库

const term = process.argv[3];
const db = new DatabaseSync(tmp, { readOnly: true });
const rows = term
  ? db.prepare("SELECT key, value FROM ItemTable WHERE value LIKE ?").all(`%${term}%`)
  : db.prepare("SELECT key, value FROM ItemTable WHERE key LIKE '%claude%'").all();

for (const r of rows) {
  const v = typeof r.value === "string" ? r.value : Buffer.from(r.value).toString("utf8");
  // 尝试解析 JSON，找出含 sessionId / 名字 的结构
  let parsed;
  try {
    parsed = JSON.parse(v);
  } catch {
    parsed = null;
  }
  console.log("================ KEY:", r.key, "(len", v.length + ")");
  if (parsed && typeof parsed === "object") {
    console.log(JSON.stringify(parsed, null, 2).slice(0, 4000));
  } else {
    console.log(v.slice(0, 2000));
  }
}
db.close();
rmSync(tmp, { force: true });
