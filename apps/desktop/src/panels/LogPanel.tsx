import { useT } from "../i18n/index.js";

export interface LogLine {
  kind: "log" | "inbound" | "outbound";
  level?: "info" | "warn" | "error";
  text: string;
  ts: number;
}

export function LogPanel({ lines }: { lines: LogLine[] }) {
  const t = useT();
  if (lines.length === 0) return <div className="panel-empty">{t("暂无日志")}</div>;
  return (
    <div className="logs">
      {lines.map((l, i) => (
        <div key={i} className={`logline log-${l.kind} lvl-${l.level ?? ""}`}>
          <span className="log-ts">{new Date(l.ts).toLocaleTimeString()}</span>
          <span className="log-tag">
            {l.kind === "inbound" ? "📥" : l.kind === "outbound" ? "📤" : "•"}
          </span>
          <span className="log-text">{l.text}</span>
        </div>
      ))}
    </div>
  );
}
