import { readFileSync } from "node:fs";
import { forkAndSanitize } from "./claude/fork-prepare.js";
import { transcriptPath } from "./claude/session-path.js";

/** 验证 fork 脱敏：fork 出来的会话抹掉密钥，base 原文不动 */
async function main() {
  const base = "00000000-0000-0000-0000-000000000000"; // 含暗号「REDACT-ME-TEST-SECRET」
  const cwd = "C:/Users/user/Desktop/OblivionisAgent";
  const secret = "REDACT-ME-TEST-SECRET";

  const forkId = await forkAndSanitize({
    baseSessionId: base,
    cwd,
    binPath: "claude",
    secrets: [secret],
    log: (l, m) => console.log(`[${l}] ${m}`),
  });
  console.log("forkId =", forkId);

  const fork = readFileSync(transcriptPath(cwd, forkId), "utf8");
  const baseTxt = readFileSync(transcriptPath(cwd, base), "utf8");

  const forkHasSecret = fork.includes(secret);
  const forkRedacted = fork.includes("[REDACTED]");
  const baseHasSecret = baseTxt.includes(secret);

  console.log("fork 仍含明文密钥? ", forkHasSecret, "(应 false)");
  console.log("fork 含 [REDACTED]? ", forkRedacted, "(应 true)");
  console.log("base 仍含明文密钥? ", baseHasSecret, "(应 true, 原文不动)");

  if (!forkHasSecret && forkRedacted && baseHasSecret) {
    console.log("✅ 脱敏验证通过：fork 无密、base 完好");
    process.exit(0);
  }
  console.error("❌ 脱敏异常");
  process.exit(2);
}
main().catch((e) => {
  console.error("smoke-fork 失败:", e);
  process.exit(1);
});
