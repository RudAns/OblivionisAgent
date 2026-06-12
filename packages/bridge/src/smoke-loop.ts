import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { OblivionisConfig } from "@oblivionis/shared";
import { Hub } from "./hub.js";
import { Logger } from "./logger.js";
import { ConfigStore } from "./config-store.js";
import { SessionManager } from "./claude/session-manager.js";
import { route } from "./router.js";

/**
 * 全链路(无 WS/端口)验证：构造 群->路由->会话 的图，
 * 模拟一条入站消息，跑 route() -> SessionManager.send() -> 真 claude，断言回复。
 * 运行：pnpm --filter @oblivionis/bridge smoke:loop
 */
async function main() {
  const cfgPath = join(tmpdir(), `oblivionis-smoke-${randomUUID()}.json`);
  const hub = new Hub();
  const log = new Logger(hub);
  const store = new ConfigStore(cfgPath);

  const demo = OblivionisConfig.parse({
    version: 1,
    claude: { binPath: process.env.CLAUDE_BIN || "claude", defaultCwd: process.cwd() },
    graph: {
      nodes: [
        {
          id: "g",
          kind: "feishu-group",
          position: { x: 0, y: 0 },
          label: "群",
          data: { chatId: "mock-chat", triggerMode: "all" },
        },
        {
          id: "r",
          kind: "route",
          position: { x: 0, y: 0 },
          label: "路由",
          data: {},
        },
        {
          id: "s",
          kind: "claude-session",
          position: { x: 0, y: 0 },
          label: "会话",
          data: {
            cwd: process.cwd(),
            permissionMode: "default",
            includePartialMessages: false,
            extraArgs: ["--tools", ""],
          },
        },
      ],
      edges: [
        { id: "e1", source: "g", target: "r" },
        { id: "e2", source: "r", target: "s" },
      ],
    },
  });
  store.save(demo);

  const sessions = new SessionManager(store, hub, log);
  let evtCount = 0;
  hub.onBridge((m) => {
    if (m.type === "session-event") evtCount++;
  });

  const inbound = {
    chatId: "mock-chat",
    senderId: "u",
    senderName: "U",
    text: "Reply with exactly: routed-ok",
    isMention: true,
  };

  const r = await route(store.get(), inbound);
  if (!r) {
    console.error("❌ 路由失败：没匹配到会话节点");
    process.exit(2);
  }
  console.log(`路由命中 -> 会话节点 ${r.sessionNode.id}; 文本: ${JSON.stringify(r.text)}`);

  const reply = await sessions.send(r.sessionNode.id, r.text);
  console.log(`回复: ${JSON.stringify(reply)}; 期间收到 ${evtCount} 条 stream-json 事件`);

  rmSync(cfgPath, { force: true });

  if (/routed-ok/i.test(reply)) {
    console.log("✅ 全链路通过：飞书入站 → 路由 → 会话管理 → 真 claude → 回复");
    process.exit(0);
  }
  console.error("❌ 未得到预期回复");
  process.exit(3);
}

main().catch((e) => {
  console.error("smoke-loop 失败:", e);
  process.exit(1);
});
