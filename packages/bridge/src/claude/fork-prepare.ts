import { readFileSync, writeFileSync, existsSync } from "node:fs";
import spawn from "cross-spawn";
import { transcriptPath } from "./session-path.js";

export interface ForkPrepareOptions {
  baseSessionId: string;
  cwd: string;
  binPath: string;
  /** 要从 fork 记录里抹掉的密钥明文 */
  secrets: string[];
  log: (level: "info" | "warn" | "error", msg: string) => void;
}

/**
 * 从基础会话 fork 出一个访客会话，并对 fork 出来的 transcript 脱敏：
 * 把已知密钥(App Secret / 本地 OAuth 令牌等)替换为 [REDACTED]。
 * 主人的基础会话原文不受影响（fork 只读 base、脱敏只改 fork 文件）。
 * 返回新 fork 会话 id。
 */
export async function forkAndSanitize(o: ForkPrepareOptions): Promise<string> {
  const forkId = await runForkInit(o);
  const file = transcriptPath(o.cwd, forkId);
  if (existsSync(file)) {
    try {
      sanitizeTranscript(file, o.secrets);
      o.log("info", `访客会话 ${forkId} 已脱敏(${o.secrets.length} 条密钥)`);
    } catch (e) {
      o.log("warn", `脱敏 fork 失败: ${(e as Error).message}`);
    }
  } else {
    o.log("warn", `未找到 fork transcript: ${file}`);
  }
  return forkId;
}

/** 跑一次 `claude -p --resume <base> --fork-session` 创建 fork，捕获新会话 id（不动文件、不用工具） */
function runForkInit(o: ForkPrepareOptions): Promise<string> {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--resume",
    o.baseSessionId,
    "--fork-session",
    "--permission-mode",
    "default",
    "--tools",
    "",
  ];
  return new Promise<string>((resolve, reject) => {
    const child = spawn(o.binPath, args, { cwd: o.cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env });
    let forkId: string | undefined;
    let buf = "";
    // 超时兜底：fork 卡住(等鉴权/网络)会让首条访客消息无限期 stall，180s 后杀掉并报错
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      reject(new Error("fork 初始化超时(180s)"));
    }, 180_000);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const evt = JSON.parse(line) as { session_id?: string };
          if (!forkId && typeof evt.session_id === "string") forkId = evt.session_id;
        } catch {
          /* ignore */
        }
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`fork 初始化失败: ${err.message}`));
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (forkId) resolve(forkId);
      else reject(new Error("fork 初始化未拿到新会话 id"));
    });
    child.stdin?.write("（系统：初始化访客会话，请只回复 OK，不要执行任何操作。）");
    child.stdin?.end();
  });
}

/** 逐行解析 jsonl，对所有字符串值做密钥替换，写回（保持 JSON 合法） */
function sanitizeTranscript(file: string, secrets: string[]): void {
  const clean = secrets.filter((s) => s && s.length >= 8);
  if (clean.length === 0) return;
  const lines = readFileSync(file, "utf8").split("\n");
  const out = lines.map((line) => {
    const t = line.trim();
    if (!t) return line;
    try {
      return JSON.stringify(redact(JSON.parse(t), clean));
    } catch {
      return line; // 非 JSON 行原样保留
    }
  });
  writeFileSync(file, out.join("\n"), "utf8");
}

function redact(v: unknown, secrets: string[]): unknown {
  if (typeof v === "string") {
    let s = v;
    for (const sec of secrets) if (s.includes(sec)) s = s.split(sec).join("[REDACTED]");
    return s;
  }
  if (Array.isArray(v)) return v.map((x) => redact(x, secrets));
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>))
      o[k] = redact((v as Record<string, unknown>)[k], secrets);
    return o;
  }
  return v;
}
