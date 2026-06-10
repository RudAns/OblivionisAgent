import type { Hub } from "./hub.js";

type Level = "info" | "warn" | "error";

export class Logger {
  constructor(private hub: Hub) {}

  private emit(level: Level, parts: unknown[]) {
    const msg = parts
      .map((p) => (typeof p === "string" ? p : safeStringify(p)))
      .join(" ");
    const ts = Date.now();
    const tag = `[${new Date(ts).toISOString()}] ${level.toUpperCase()}`;
    // 控制台
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(
      tag,
      msg,
    );
    // 推送给 GUI
    this.hub.broadcast({ type: "log", level, msg, ts });
  }

  info(...parts: unknown[]) {
    this.emit("info", parts);
  }
  warn(...parts: unknown[]) {
    this.emit("warn", parts);
  }
  error(...parts: unknown[]) {
    this.emit("error", parts);
  }
}

function safeStringify(v: unknown): string {
  if (v instanceof Error) return v.stack ?? v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
