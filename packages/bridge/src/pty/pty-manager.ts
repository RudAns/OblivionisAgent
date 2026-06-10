import { randomUUID } from "node:crypto";
import type { ConfigStore } from "../config-store.js";
import type { Hub } from "../hub.js";
import type { Logger } from "../logger.js";

/**
 * 真实交互式终端(PTY)管理。
 * 为某个 Claude 会话节点开一个 *交互式* `claude` 进程，前端用 xterm.js 直接观看/输入。
 * 这是"两者都要"里的第二种呈现：原汁原味的 CLI。
 *
 * node-pty 是可选原生依赖；未安装时 PTY 功能优雅降级（只走 stream-json 转录）。
 */
export class PtyManager {
  private ptys = new Map<string, any>();
  private ptyMod: any = null;
  private ptyModTried = false;

  constructor(
    private store: ConfigStore,
    private hub: Hub,
    private log: Logger,
  ) {}

  private async loadPty(): Promise<any | null> {
    if (this.ptyModTried) return this.ptyMod;
    this.ptyModTried = true;
    try {
      this.ptyMod = await import("node-pty");
    } catch {
      this.log.warn(
        "未安装 node-pty，真实终端(PTY)不可用。安装：pnpm --filter @oblivionis/bridge add node-pty",
      );
      this.ptyMod = null;
    }
    return this.ptyMod;
  }

  async open(nodeId: string): Promise<void> {
    const pty = await this.loadPty();
    if (!pty) return;

    const cfg = this.store.get();
    const node = cfg.graph.nodes.find((n) => n.id === nodeId);
    if (!node || node.kind !== "claude-session") {
      this.log.error(`PTY: 未找到会话节点 ${nodeId}`);
      return;
    }
    const cwd = node.data.cwd || cfg.claude.defaultCwd || process.cwd();
    const bin = cfg.claude.binPath;

    // Windows 上 claude 通常是 .cmd，用 ComSpec 包一层最稳；posix 直接起
    const isWin = process.platform === "win32";
    const file = isWin ? process.env.ComSpec || "cmd.exe" : bin;
    const args = isWin ? ["/c", bin] : [];

    const ptyId = randomUUID();
    const proc = pty.spawn(file, args, {
      name: "xterm-color",
      cols: 120,
      rows: 30,
      cwd,
      env: process.env,
    });
    this.ptys.set(ptyId, proc);
    this.hub.broadcast({ type: "pty-opened", ptyId, nodeId });
    this.log.info(`PTY 已开 ptyId=${ptyId} node=${nodeId} cwd=${cwd}`);

    proc.onData((data: string) => this.hub.broadcast({ type: "pty-data", ptyId, data }));
    proc.onExit(({ exitCode }: { exitCode: number }) => {
      this.ptys.delete(ptyId);
      this.hub.broadcast({ type: "pty-exit", ptyId, code: exitCode });
    });
  }

  input(ptyId: string, data: string): void {
    this.ptys.get(ptyId)?.write(data);
  }
  resize(ptyId: string, cols: number, rows: number): void {
    try {
      this.ptys.get(ptyId)?.resize(cols, rows);
    } catch {
      /* ignore */
    }
  }
  close(ptyId: string): void {
    const p = this.ptys.get(ptyId);
    if (p) {
      try {
        p.kill();
      } catch {
        /* ignore */
      }
      this.ptys.delete(ptyId);
    }
  }
}
