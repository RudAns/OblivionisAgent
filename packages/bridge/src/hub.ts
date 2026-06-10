import { EventEmitter } from "node:events";
import type { BridgeMessage } from "@oblivionis/shared";

/**
 * 进程内事件总线：各子系统(传输/会话/PTY)把要发给 GUI 的 BridgeMessage 丢到这里，
 * WS server 订阅后广播给所有连接的前端。
 */
export class Hub extends EventEmitter {
  broadcast(msg: BridgeMessage): void {
    this.emit("bridge", msg);
  }
  onBridge(cb: (msg: BridgeMessage) => void): void {
    this.on("bridge", cb);
  }
}
