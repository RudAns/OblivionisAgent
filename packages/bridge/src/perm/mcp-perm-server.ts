import { createInterface } from "node:readline";
import WebSocket from "ws";

/**
 * MCP 权限审批服务器（oblivionis-bridge --mcp-perm 模式）。
 *
 * 由 claude CLI 作为 stdio MCP server 启动（--mcp-config 指到本 exe + --mcp-perm），
 * claude 在工具需要授权时调用 `approve` 工具 → 本进程经 WS 回连 bridge 主进程 →
 * bridge 发飞书审批卡片 → 主人点击 → 决定回流 → 返回给 claude。
 *
 * 协议：
 * - stdio 侧：MCP（JSON-RPC 2.0，按行分隔）：initialize / tools/list / tools/call
 * - 审批结果：content[0].text = JSON 字符串 {"behavior":"allow"|"deny","message"?}
 * - 上下文：spawn 时 env OBLIVIONIS_PERM_CTX = JSON{nodeId,nodeLabel,chatId,senderId,senderName}
 * - 超时：UI 无人响应 110s → deny（安全默认）
 */
export function runMcpPermServer(): void {
  const wsPort = Number(process.env.OBLIVIONIS_WS_PORT || "8920");
  const ctxRaw = process.env.OBLIVIONIS_PERM_CTX || "{}";

  const write = (msg: unknown) => {
    process.stdout.write(JSON.stringify(msg) + "\n");
  };

  /** 经 WS 问 bridge 主进程要一个审批决定 */
  const askBridge = (toolName: string, input: unknown): Promise<{ behavior: string; message?: string }> =>
    new Promise((resolve) => {
      const requestId = `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let done = false;
      const finish = (r: { behavior: string; message?: string }) => {
        if (done) return;
        done = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve(r);
      };
      const timer = setTimeout(
        () => finish({ behavior: "deny", message: "等待主人审批超时(110s)，已默认拒绝" }),
        110_000,
      );
      const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);
      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "permission-request",
            requestId,
            toolName,
            input,
            ctx: JSON.parse(ctxRaw),
          }),
        );
      });
      ws.on("message", (raw) => {
        try {
          const m = JSON.parse(String(raw)) as {
            type?: string;
            requestId?: string;
            behavior?: string;
            message?: string;
          };
          if (m.type === "permission-response" && m.requestId === requestId) {
            clearTimeout(timer);
            finish({ behavior: m.behavior === "allow" ? "allow" : "deny", message: m.message });
          }
        } catch {
          /* 忽略其它广播 */
        }
      });
      ws.on("error", () => {
        clearTimeout(timer);
        finish({ behavior: "deny", message: "无法连接审批服务" });
      });
      ws.on("close", () => {
        clearTimeout(timer);
        finish({ behavior: "deny", message: "审批通道中断" });
      });
    });

  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    let msg: { jsonrpc?: string; id?: number | string; method?: string; params?: any };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const { id, method, params } = msg;
    switch (method) {
      case "initialize":
        write({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: params?.protocolVersion ?? "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "oblivionis-perm", version: "1.0.0" },
          },
        });
        break;
      case "notifications/initialized":
        break; // 无需响应
      case "tools/list":
        write({
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "approve",
                description:
                  "Ask the owner (via Feishu card) whether a tool call is permitted. Returns JSON {behavior:allow|deny}.",
                inputSchema: {
                  type: "object",
                  properties: {
                    tool_name: { type: "string" },
                    input: { type: "object" },
                    tool_use_id: { type: "string" },
                  },
                  required: ["tool_name", "input"],
                },
              },
            ],
          },
        });
        break;
      case "tools/call": {
        const toolName = String(params?.arguments?.tool_name ?? "unknown");
        const input = params?.arguments?.input ?? {};
        void askBridge(toolName, input).then((decision) => {
          write({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    decision.behavior === "allow"
                      ? { behavior: "allow", updatedInput: input }
                      : { behavior: "deny", message: decision.message ?? "主人拒绝了该操作" },
                  ),
                },
              ],
            },
          });
        });
        break;
      }
      case "ping":
        write({ jsonrpc: "2.0", id, result: {} });
        break;
      default:
        if (id !== undefined) {
          write({ jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method ${method}` } });
        }
    }
  });
}
