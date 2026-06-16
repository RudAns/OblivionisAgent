import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useT } from "../i18n/index.js";

/** 桌面应用环境检测（与 TerminalsHost 一致）。 */
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface ReportFile {
  name: string;
  path: string;
  ext: string;
  size: number;
  modifiedMs: number;
}
interface Listing {
  dir: string;
  files: ReportFile[];
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function extIcon(ext: string): string {
  switch (ext) {
    case "html":
    case "htm":
      return "🌐";
    case "md":
    case "markdown":
      return "📝";
    case "pdf":
      return "📕";
    case "csv":
    case "xlsx":
      return "📊";
    default:
      return "📄";
  }
}

const linkStyle: React.CSSProperties = {
  cursor: "pointer",
  textDecoration: "underline",
  opacity: 0.8,
  fontSize: "0.85em",
};

/**
 * 阅读清单：列出 ~/.oblivionis/reports/ 里 Claude 生成的、给人读的报告/文档。
 * 设计要点：只读这个专属目录——代码 / 配置改动永远不会出现在这里。
 * 点条目用默认程序打开（.html→浏览器、.md→VSCode，复用 open_path）。
 */
export function ReportsPanel() {
  const t = useT();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!inTauri()) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await invoke<Listing>("list_reports");
      setListing(r);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = (path: string) => {
    void invoke("open_path", { path, base: "" }).catch(() => {});
  };

  if (!inTauri())
    return <div className="panel-empty">{t("阅读清单仅在桌面应用中可用（浏览器开发版不支持）。")}</div>;

  const files = listing?.files ?? [];

  return (
    <div className="audit">
      <div className="audit-group">
        <div className="audit-group-head" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span>{t("阅读清单")}</span>
          {listing?.dir && <span className="muted" title={listing.dir}>{listing.dir}</span>}
          <span style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
            <a style={linkStyle} onClick={() => void refresh()}>
              {loading ? t("刷新中…") : t("刷新")}
            </a>
            {listing?.dir && (
              <a style={linkStyle} onClick={() => open(listing.dir)}>
                {t("打开文件夹")}
              </a>
            )}
          </span>
        </div>

        {err && (
          <div className="panel-empty">
            {t("读取失败：")}
            {err}
          </div>
        )}

        {!err && files.length === 0 && (
          <div className="panel-empty">
            {t("还没有文档。")}
            <br />
            {t("Claude 为你生成的报告 / 文档（HTML、Markdown 等）会出现在这里——只收阅读材料，不含代码或配置改动。")}
            <br />
            <code>~/.oblivionis/reports/</code>
          </div>
        )}

        {!err &&
          files.map((f) => (
            <div
              key={f.path}
              className="audit-row"
              style={{ cursor: "pointer" }}
              onClick={() => open(f.path)}
              title={t("点击打开：{0}", f.path)}
            >
              <span className="audit-sender">{extIcon(f.ext)}</span>
              <span className="audit-text">{f.name}</span>
              <span className="audit-ts">
                {f.modifiedMs ? new Date(f.modifiedMs).toLocaleString() : ""} · {fmtSize(f.size)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
