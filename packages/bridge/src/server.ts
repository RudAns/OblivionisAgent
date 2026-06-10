import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, BridgeMessage, AuditEntry } from "@oblivionis/shared";
import type { ConfigStore } from "./config-store.js";
import type { Hub } from "./hub.js";
import type { Logger } from "./logger.js";
import type { SessionManager } from "./claude/session-manager.js";
import type { PtyManager } from "./pty/pty-manager.js";
import { listSessions } from "./claude/session-listing.js";

/** 图的"会话相关指纹"：忽略坐标/标签，只看 id/kind/data 与连线，用于判断是否需要重建会话 */
function materialGraph(cfg: { graph: { nodes: Array<{ id: string; kind: string; data: unknown }>; edges: Array<{ source: string; target: string }> } }): string {
  const nodes = cfg.graph.nodes
    .map((n) => ({ id: n.id, kind: n.kind, data: n.data }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const edges = cfg.graph.edges
    .map((e) => ({ s: e.source, t: e.target }))
    .sort((a, b) => (a.s + a.t < b.s + b.t ? -1 : 1));
  return JSON.stringify({ nodes, edges });
}

export interface ServerDeps {
  store: ConfigStore;
  hub: Hub;
  log: Logger;
  sessions: SessionManager;
  ptys: PtyManager;
  /** 返回最近一次飞书状态（新连接时下发） */
  getFeishuStatus: () => BridgeMessage;
  feishuConnect: () => void;
  feishuDisconnect: () => void;
  feishuSet: (appId: string, appSecret: string, domain: "feishu" | "lark") => void;
  lookupOpenId: (
    mobile?: string,
    email?: string,
  ) => Promise<Array<{ label: string; openId: string }>>;
  /** 读取审计历史 */
  getAudit: () => AuditEntry[];
  /** 配置(graph)被 GUI 改写后回调 */
  onConfigChanged: () => void;
}

/**
 * 本地 WebSocket 控制面：GUI(Tauri 前端) <-> Bridge。
 * - 新连接推送当前配置。
 * - Hub 上的所有 BridgeMessage 广播给全部前端。
 */
export class ControlServer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();

  constructor(private port: number, private deps: ServerDeps) {}

  start(): void {
    this.wss = new WebSocketServer({ host: "127.0.0.1", port: this.port });
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      this.send(ws, { type: "config", config: this.deps.store.get() });
      this.send(ws, this.deps.getFeishuStatus());
      this.send(ws, { type: "audit-history", items: this.deps.getAudit() });
      ws.on("message", (raw) => this.onClientMessage(raw.toString()));
      ws.on("close", () => this.clients.delete(ws));
      ws.on("error", () => this.clients.delete(ws));
    });

    // 把 Hub 的广播转发给所有前端
    this.deps.hub.onBridge((msg) => this.broadcast(msg));

    this.deps.log.info(`控制面 WebSocket 监听 ws://127.0.0.1:${this.port}`);
  }

  private onClientMessage(text: string): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(text) as ClientMessage;
    } catch {
      this.deps.log.warn(`收到非法 WS 消息: ${text.slice(0, 120)}`);
      return;
    }
    const { store, sessions, ptys, hub, log, onConfigChanged } = this.deps;

    switch (msg.type) {
      case "get-config":
        hub.broadcast({ type: "config", config: store.get() });
        break;
      case "set-config": {
        const before = materialGraph(store.get());
        store.save(msg.config);
        const after = materialGraph(store.get());
        // 仅当会话相关内容(cwd/sessionId/base/model/权限/路由等)变化才重建会话；
        // 纯布局(拖动节点)等自动保存不打断正在运行的会话。
        if (before !== after) sessions.invalidate();
        onConfigChanged();
        hub.broadcast({ type: "config", config: store.get() });
        break;
      }
      case "feishu-set":
        this.deps.feishuSet(msg.appId, msg.appSecret, msg.domain);
        break;
      case "feishu-connect":
        this.deps.feishuConnect();
        break;
      case "feishu-disconnect":
        this.deps.feishuDisconnect();
        break;
      case "list-sessions":
        hub.broadcast({ type: "sessions", cwd: msg.cwd, items: listSessions(msg.cwd) });
        break;
      case "get-audit":
        hub.broadcast({ type: "audit-history", items: this.deps.getAudit() });
        break;
      case "prepare-fork":
        void sessions
          .prepareGuestFork(msg.nodeId)
          .catch((e) => log.error(`刷新快照失败: ${e.message}`));
        break;
      case "lookup-openid":
        this.deps
          .lookupOpenId(msg.mobile, msg.email)
          .then((items) => hub.broadcast({ type: "openid-result", items }))
          .catch((e) =>
            hub.broadcast({ type: "openid-result", items: [], error: (e as Error).message }),
          );
        break;
      case "send-to-session":
        // GUI 测试框＝飞书侧的一条消息，同样走 fork 分身（不碰开发会话 base）
        void sessions
          .send(msg.nodeId, msg.text)
          .catch((e) => log.error(`手动发送失败: ${e.message}`));
        break;
      case "pty-open":
        void ptys.open(msg.nodeId);
        break;
      case "pty-input":
        ptys.input(msg.ptyId, msg.data);
        break;
      case "pty-resize":
        ptys.resize(msg.ptyId, msg.cols, msg.rows);
        break;
      case "pty-close":
        ptys.close(msg.ptyId);
        break;
      default:
        log.warn(`未知 WS 消息类型: ${(msg as { type: string }).type}`);
    }
  }

  private send(ws: WebSocket, msg: BridgeMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  broadcast(msg: BridgeMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  stop(): void {
    this.wss?.close();
  }
}
