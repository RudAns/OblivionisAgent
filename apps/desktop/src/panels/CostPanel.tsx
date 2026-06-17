import type { CSSProperties } from "react";
import type { CostSnapshot } from "@oblivionis/shared";
import { useT } from "../i18n/index.js";

function usd(n: number): string {
  return "$" + (n > 0 && n < 0.01 ? n.toFixed(4) : n.toFixed(2));
}
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

const sectionH: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "var(--muted)",
  margin: "0 0 8px",
};

/**
 * 成本看板：累计 / 今日花费、按会话、按天、最近运行。
 * 数据来自每次会话运行完成的 stream-json cost_usd（引擎记到 ~/.oblivionis/costs.jsonl）。
 */
export function CostPanel({ cost }: { cost: CostSnapshot | null }) {
  const t = useT();
  if (!cost || cost.runs === 0)
    return (
      <div className="panel-empty">
        {t("还没有花费记录。")}
        <br />
        {t("每次「Claude 会话」运行完成后这里会记一笔（数据来自 stream-json 的 cost_usd）。")}
        <br />
        <code>~/.oblivionis/costs.jsonl</code>
      </div>
    );

  const maxNode = Math.max(...cost.perNode.map((n) => n.cost), 0.0001);
  const maxDay = Math.max(...cost.daily.map((d) => d.cost), 0.0001);

  const card = (label: string, value: string, sub?: string) => (
    <div style={{ flex: 1, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {card(t("累计花费"), usd(cost.total), t("{0} 次运行", cost.runs))}
        {card(t("今日花费"), usd(cost.today))}
        {card(t("会话数"), String(cost.perNode.length))}
      </div>

      <div style={sectionH}>{t("按会话")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
        {cost.perNode.map((n) => (
          <div key={n.nodeId} title={`${n.runs} ${t("次")} · ${n.lastTs ? new Date(n.lastTs).toLocaleString() : ""}`}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 2 }}>
              <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                {n.label || n.nodeId}
              </span>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>{usd(n.cost)}</span>
            </div>
            <div style={{ height: 7, background: "var(--input)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${(n.cost / maxNode) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>

      <div style={sectionH}>{t("近 14 天")}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 92, marginBottom: 18, padding: "0 2px" }}>
        {cost.daily.map((d) => (
          <div
            key={d.day}
            title={`${d.day} · ${usd(d.cost)} · ${d.runs} ${t("次")}`}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, height: "100%", justifyContent: "flex-end" }}
          >
            <div style={{ width: "100%", maxWidth: 22, height: `${Math.max((d.cost / maxDay) * 70, 2)}px`, background: "var(--st-run)", borderRadius: "3px 3px 0 0" }} />
            <span style={{ fontSize: 9, color: "var(--muted)" }}>{d.day.slice(5)}</span>
          </div>
        ))}
      </div>

      <div style={sectionH}>{t("最近运行")}</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {cost.recent.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{new Date(r.ts).toLocaleString().slice(5)}</span>
            <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={r.model}>
              {r.label || r.nodeId}
            </span>
            <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
              {fmtTokens(r.ctxTokens)}→{fmtTokens(r.outTokens)}
            </span>
            <span style={{ color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap" }}>{usd(r.cost)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
