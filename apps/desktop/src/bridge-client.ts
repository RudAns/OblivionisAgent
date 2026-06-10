import type { ClientMessage, BridgeMessage } from "@oblivionis/shared";

type Handler = (msg: BridgeMessage) => void;

/**
 * 与本地 Bridge 的 WebSocket 客户端：自动重连 + 离线消息排队。
 */
export class BridgeClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private queue: ClientMessage[] = [];
  private closed = false;

  constructor(private url: string) {}

  connect(): void {
    this.closed = false;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => this.flush();
    ws.onmessage = (ev) => {
      let msg: BridgeMessage;
      try {
        msg = JSON.parse(ev.data as string) as BridgeMessage;
      } catch {
        return;
      }
      this.handlers.forEach((h) => h(msg));
    };
    ws.onclose = () => {
      if (!this.closed) setTimeout(() => this.connect(), 1500);
    };
    ws.onerror = () => ws.close();
  }

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.queue.push(msg);
    }
  }

  private flush(): void {
    const q = this.queue;
    this.queue = [];
    q.forEach((m) => this.send(m));
  }

  dispose(): void {
    this.closed = true;
    this.ws?.close();
  }
}
