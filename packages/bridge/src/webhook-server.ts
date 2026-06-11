import { createServer, type Server } from "node:http";
import type { ConfigStore } from "./config-store.js";
import type { Logger } from "./logger.js";
import type { WebhookNode, ClaudeSessionNode } from "@oblivionis/shared";

/**
 * Webhook 入口（vision-agentic-roadmap.md 待办 #3）：
 * 外部系统(GitHub/Jenkins/CI) POST 到 http://<本机>:<port>/hook/<token> →
 * 找到匹配 token 的 webhook 节点 → 沿连线找下游会话 → 用模板(含 {{body}})跑一次 →
 * 结果(出站脱敏)发到节点群或 homeChatId。
 *
 * 安全：token 即口令（仅本机/局域网可达；外网需自建隧道）。无匹配 token → 404。
 * 绑定 0.0.0.0 让同网段的 Jenkins/CI 能回调；纯本机用 127.0.0.1 也可（看部署）。
 */
export interface WebhookDeps {
  store: ConfigStore;
  log: Logger;
  runPrompt: (sessionNodeId: string, prompt: string) => Promise<string>;
  deliver: (chatId: string, text: string) => Promise<void>;
}

export class WebhookServer {
  private server: Server | null = null;
  private listeningPort: number | null = null;

  constructor(private deps: WebhookDeps) {}

  /** 有 webhook 节点才真正监听；端口变化或从无到有时重启 */
  sync(): void {
    const cfg = this.deps.store.get();
    const hasWebhook = cfg.graph.nodes.some((n) => n.kind === "webhook");
    const port = cfg.bridge.webhookPort;
    if (!hasWebhook) {
      this.stop();
      return;
    }
    if (this.server && this.listeningPort === port) return; // 已在正确端口监听
    this.stop();
    this.start(port);
  }

  private start(port: number): void {
    const server = createServer((req, res) => {
      const url = req.url || "";
      const m = /^\/hook\/([A-Za-z0-9_-]+)\/?$/.exec(url.split("?")[0] ?? "");
      if (req.method !== "POST" || !m) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("not found");
        return;
      }
      const token = m[1];
      const node = this.deps.store
        .get()
        .graph.nodes.find(
          (n): n is WebhookNode => n.kind === "webhook" && n.data.enabled !== false && n.data.token === token,
        );
      if (!node) {
        res.writeHead(403);
        res.end("invalid token");
        return;
      }

      let body = "";
      let tooBig = false;
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 100_000) {
          tooBig = true;
          body = body.slice(0, 100_000);
        }
      });
      req.on("end", () => {
        // 立刻 202 应答，处理异步进行（webhook 调用方不等 LLM）
        res.writeHead(202, { "content-type": "text/plain; charset=utf-8" });
        res.end("accepted");
        void this.dispatch(node, tooBig ? body + "\n…(截断)" : body);
      });
    });
    server.on("error", (e) => {
      this.deps.log.error(`Webhook 端口 ${port} 监听失败: ${(e as Error).message}`);
      this.server = null;
      this.listeningPort = null;
    });
    // 0.0.0.0：同网段 CI/Jenkins 可回调
    server.listen(port, "0.0.0.0", () => {
      this.server = server;
      this.listeningPort = port;
      this.deps.log.info(`Webhook 入口监听 http://0.0.0.0:${port}/hook/<token>`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.listeningPort = null;
    }
  }

  private async dispatch(node: WebhookNode, body: string): Promise<void> {
    const cfg = this.deps.store.get();
    const targetIds = cfg.graph.edges.filter((e) => e.source === node.id).map((e) => e.target);
    const session = cfg.graph.nodes.find(
      (n): n is ClaudeSessionNode => n.kind === "claude-session" && targetIds.includes(n.id),
    );
    if (!session) {
      this.deps.log.warn(`Webhook「${node.label}」未连接到 Claude 会话，丢弃`);
      return;
    }
    const prompt = (node.data.prompt || "{{body}}").replace("{{body}}", body.slice(0, 8000));
    this.deps.log.info(`Webhook 触发:「${node.label}」→ ${session.label}`);
    try {
      const reply = await this.deps.runPrompt(session.id, prompt);
      const chatId = node.data.chatId || cfg.homeChatId;
      if (chatId && reply.trim()) await this.deps.deliver(chatId, `🪝 「${node.label}」\n\n${reply}`);
      else if (reply.trim()) this.deps.log.info(`Webhook「${node.label}」完成(未配置群): ${reply.slice(0, 200)}`);
    } catch (e) {
      this.deps.log.error(`Webhook「${node.label}」失败: ${(e as Error).message}`);
    }
  }
}
