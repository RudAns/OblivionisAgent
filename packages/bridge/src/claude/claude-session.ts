import { randomUUID } from "node:crypto";
import spawn from "cross-spawn";
import type { ChildProcess } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ClaudeStreamEvent, SessionStatus } from "@oblivionis/shared";
import { isResult } from "@oblivionis/shared";
import { sessionArgs } from "./session-path.js";

/** 审批请求的上下文（spawn 时经 env 传给 MCP 审批进程，卡片据此发到来源群） */
export interface PermCtxLite {
  nodeId: string;
  nodeLabel?: string;
  chatId?: string;
  senderId?: string;
  senderName?: string;
}

/** 大数字格式化：849000 -> 849k，1230000 -> 1.23M */
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + "k";
  return String(n);
}

export interface ClaudeSessionOptions {
  nodeId: string;
  /** 节点显示名（用于日志/花费展示） */
  label?: string;
  /** 已知运行会话 UUID（--resume）；fork 模式下首次为空，运行后捕获并回填 */
  sessionId?: string;
  /** fork 来源会话 UUID（如"角色管线"开发会话）：首次 `--resume <base> --fork-session` */
  baseSessionId?: string;
  binPath: string;
  cwd: string;
  model?: string;
  permissionMode: string;
  appendSystemPrompt?: string;
  includePartialMessages: boolean;
  extraArgs: string[];
  /** 敏感操作飞书审批：true 时挂 MCP 审批工具（--permission-prompt-tool） */
  approval?: boolean;
  /** bridge WS 端口（审批 MCP 进程回连用） */
  wsPort?: number;
  onEvent: (e: ClaudeStreamEvent) => void;
  onStatus: (s: SessionStatus) => void;
  /** 发现/分配会话 id 时回调（fork 出新 id 或自动生成时），用于持久化到配置 */
  onSessionId: (id: string) => void;
  log: (level: "info" | "warn" | "error", msg: string) => void;
}

interface Job {
  text: string;
  /** 本次运行的权限模式覆盖（按@消息的发送者是主人/访客而定） */
  permissionMode?: string;
  /** 本次运行追加的 system prompt（访客护栏等），覆盖节点默认 */
  appendSystemPrompt?: string;
  /** 审批上下文（卡片发到来源群） */
  permCtx?: PermCtxLite;
  resolve: (finalText: string) => void;
  reject: (err: Error) => void;
}

/**
 * 一个 Claude 会话节点对应一个 ClaudeSession。
 * 每条入站消息 = 一次 `claude -p ... --resume <id>` 子进程调用（串行排队，一次一条）。
 *
 * 关键：这是"遥控官方 CLI"(路径 B)，用的是本机订阅登录态(OAuth)，不是 API Key。
 */
export class ClaudeSession {
  private queue: Job[] = [];
  private busy = false;
  private active: ChildProcess | null = null;
  /** 当前运行会话 id；fork 模式首次为空，捕获后填上 */
  private runningSessionId: string | undefined;

  constructor(private opts: ClaudeSessionOptions) {
    this.runningSessionId = opts.sessionId;
  }

  /** 决定本次运行的会话参数：已知会话→resume；否则有 base→fork；都没有→生成新 id */
  private sessionFlags(): string[] {
    if (this.runningSessionId) return sessionArgs(this.opts.cwd, this.runningSessionId);
    if (this.opts.baseSessionId) return ["--resume", this.opts.baseSessionId, "--fork-session"];
    const id = randomUUID();
    this.runningSessionId = id;
    this.opts.onSessionId(id);
    return ["--session-id", id];
  }

  /** 入队一条消息，返回最终回复文本。permissionMode / appendSystemPrompt 可按本次发送者覆盖 */
  send(
    text: string,
    permissionMode?: string,
    appendSystemPrompt?: string,
    permCtx?: PermCtxLite,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ text, permissionMode, appendSystemPrompt, permCtx, resolve, reject });
      void this.pump();
    });
  }

  /** 中断当前运行 */
  interrupt(): void {
    if (this.active) {
      this.active.kill();
      this.active = null;
    }
  }

  private async pump(): Promise<void> {
    if (this.busy) return;
    const job = this.queue.shift();
    if (!job) return;
    this.busy = true;
    this.opts.onStatus("running");
    try {
      const finalText = await this.runOnce(job.text, job.permissionMode, job.appendSystemPrompt, job.permCtx);
      job.resolve(finalText);
      this.opts.onStatus("idle");
    } catch (err) {
      this.opts.onStatus("error");
      job.reject(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.busy = false;
      void this.pump();
    }
  }

  private buildArgs(permissionMode: string, appendSystemPrompt?: string): string[] {
    const o = this.opts;
    const append = appendSystemPrompt ?? o.appendSystemPrompt;
    return [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose", // stream-json 必须配 --verbose
      ...(o.includePartialMessages ? ["--include-partial-messages"] : []),
      ...this.sessionFlags(),
      ...(o.model ? ["--model", o.model] : []),
      "--permission-mode",
      permissionMode,
      ...(append ? ["--append-system-prompt", append] : []),
      // 飞书审批：挂上 MCP 审批工具，需要授权的工具调用会先发卡片问主人
      ...(o.approval
        ? [
            "--mcp-config",
            join(homedir(), ".oblivionis", "perm-mcp.json"),
            "--permission-prompt-tool",
            "mcp__oblivionis_perm__approve",
          ]
        : []),
      ...o.extraArgs,
    ];
  }

  private runOnce(
    text: string,
    permissionMode?: string,
    appendSystemPrompt?: string,
    permCtx?: PermCtxLite,
  ): Promise<string> {
    const o = this.opts;
    const args = this.buildArgs(permissionMode ?? o.permissionMode, appendSystemPrompt);
    o.log("info", `[${o.nodeId}] claude ${args.join(" ")} (cwd=${o.cwd})`);

    return new Promise<string>((resolve, reject) => {
      // prompt 走 stdin，彻底规避 Windows 命令行引号/转义问题
      const child = spawn(o.binPath, args, {
        cwd: o.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: o.approval
          ? {
              ...process.env,
              OBLIVIONIS_PERM_CTX: JSON.stringify(permCtx ?? { nodeId: o.nodeId, nodeLabel: o.label }),
              OBLIVIONIS_WS_PORT: String(o.wsPort ?? 8920),
            }
          : process.env,
      });
      this.active = child;

      let finalText: string | undefined;
      let stdoutBuf = "";
      let stderrBuf = "";

      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdoutBuf += chunk;
        let nl: number;
        while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
          const line = stdoutBuf.slice(0, nl).trim();
          stdoutBuf = stdoutBuf.slice(nl + 1);
          if (!line) continue;
          let evt: ClaudeStreamEvent;
          try {
            evt = JSON.parse(line) as ClaudeStreamEvent;
          } catch {
            o.log("warn", `[${o.nodeId}] 非 JSON 输出: ${line.slice(0, 200)}`);
            continue;
          }
          o.onEvent(evt);
          // fork 模式：捕获 claude 分配的新会话 id（首次出现即回填持久化）
          if (!this.runningSessionId) {
            const sid = (evt as { session_id?: unknown }).session_id;
            if (typeof sid === "string" && sid) {
              this.runningSessionId = sid;
              o.onSessionId(sid);
            }
          }
          if (isResult(evt)) {
            finalText = evt.result ?? "";
            if (evt.is_error) {
              o.log("error", `[${o.nodeId}] result 错误: ${evt.subtype}`);
            }
            // 本条花费/token：上下文 = 直输入 + 缓存新建 + 缓存读（这就是每条加载的体量）
            const u = (evt as { usage?: Record<string, number> }).usage ?? {};
            const cin = u.input_tokens ?? 0;
            const cc = u.cache_creation_input_tokens ?? 0;
            const cr = u.cache_read_input_tokens ?? 0;
            const out = u.output_tokens ?? 0;
            const ctx = cin + cc + cr;
            const cost = (evt as { total_cost_usd?: number }).total_cost_usd ?? 0;
            const turns = (evt as { num_turns?: number }).num_turns ?? 1;
            o.log(
              "info",
              `💰 [${o.label ?? o.nodeId}] $${cost.toFixed(4)} · 上下文 ${fmtTokens(ctx)}(缓存读 ${fmtTokens(cr)}/新建 ${fmtTokens(cc)}/直输 ${fmtTokens(cin)}) · 输出 ${fmtTokens(out)} · ${turns}轮`,
            );
          }
        }
      });

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        stderrBuf += chunk;
      });

      child.on("error", (err) => {
        this.active = null;
        reject(new Error(`spawn claude 失败: ${err.message}（binPath=${o.binPath}）`));
      });

      child.on("close", (code) => {
        this.active = null;
        if (stderrBuf.trim()) o.log("warn", `[${o.nodeId}] stderr: ${stderrBuf.trim().slice(0, 500)}`);
        if (finalText !== undefined) {
          resolve(finalText);
        } else if (code === 0) {
          resolve("");
        } else {
          reject(new Error(`claude 退出码 ${code}，且未收到 result 事件`));
        }
      });

      // 写入 prompt 后关闭 stdin
      child.stdin?.write(text);
      child.stdin?.end();
    });
  }
}
