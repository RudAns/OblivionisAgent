import { randomUUID } from "node:crypto";
import { ClaudeSession } from "./claude/claude-session.js";
import { assistantText, isAssistant, isInit, isResult } from "@oblivionis/shared";

/**
 * 端到端冒烟：直接驱动本机 claude（订阅登录态，路径 B），跑一次 stream-json。
 * 运行：pnpm bridge:smoke
 */
async function main() {
  const cwd = process.cwd();
  const sessionId = randomUUID();
  console.log(`[smoke] cwd=${cwd} sessionId=${sessionId}`);

  const session = new ClaudeSession({
    nodeId: "smoke",
    sessionId,
    binPath: process.env.CLAUDE_BIN || "claude",
    cwd,
    permissionMode: "default",
    includePartialMessages: false,
    extraArgs: ["--tools", ""], // 纯文本回复，禁用工具，快且无权限弹窗
    onEvent: (e) => {
      if (isInit(e)) console.log(`[init] model=${e.model} apiKeySource=${e.apiKeySource}`);
      else if (isAssistant(e)) {
        const t = assistantText(e);
        if (t) console.log(`[assistant] ${t}`);
      } else if (isResult(e))
        console.log(`[result] is_error=${e.is_error} cost=$${e.total_cost_usd}`);
    },
    onStatus: (s) => console.log(`[status] ${s}`),
    onSessionId: (id) => console.log(`[sessionId] ${id}`),
    log: (lvl, m) => console.log(`[${lvl}] ${m}`),
  });

  const reply = await session.send("Reply with exactly the word: pong");
  console.log(`\n[final reply] ${JSON.stringify(reply)}`);

  if (/pong/i.test(reply)) {
    console.log("\n✅ 冒烟通过：本机 Claude 订阅会话可被 Bridge 驱动。");
    process.exit(0);
  } else {
    console.error("\n❌ 冒烟异常：未得到预期回复。");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("smoke 失败:", e);
  process.exit(1);
});
