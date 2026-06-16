import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useT } from "../i18n/index.js";

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface MdFile {
  name: string;
  path: string;
  rel: string;
  size: number;
  modifiedMs: number;
}
interface MdListing {
  dir: string;
  files: MdFile[];
  truncated: boolean;
  exists: boolean;
}
interface DirEntry {
  path: string;
  title: string;
  kind: "project" | "public";
  sessions: string[];
}
interface NodeLike {
  type?: string;
  data?: Record<string, unknown>;
}

/** Windows 路径归一化用于去重（大小写不敏感、分隔符混用、尾斜杠）。 */
function normPath(p: string): string {
  return p.replace(/\//g, "\\").replace(/[\\/]+$/, "").toLowerCase();
}
function baseName(p: string): string {
  const cleaned = p.replace(/[\\/]+$/, "");
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || cleaned;
}
function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function dirOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i < 0 ? "" : rel.slice(0, i);
}

/**
 * Markdown 查看器（独立弹窗）。
 * 左：把各「Claude 会话」节点的工作目录去重成切换列表 + 公共目录 `~/.oblivionis/reports`；
 *     选中目录后递归列出其下所有 .md（按子目录分组，Unity 等重目录已在 Rust 侧过滤）。
 * 右：把选中的 .md 渲染成正确的 Markdown（remark-gfm：表格/任务列表/删除线…）。
 */
export function MarkdownViewer({ nodes, onClose }: { nodes: NodeLike[]; onClose: () => void }) {
  const t = useT();
  const [selDir, setSelDir] = useState<string | null>(null);
  const [listing, setListing] = useState<MdListing | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selFile, setSelFile] = useState<MdFile | null>(null);
  const [content, setContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentErr, setContentErr] = useState<string | null>(null);
  const [reportsPath, setReportsPath] = useState("");

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openFile = useCallback((f: MdFile) => {
    setSelFile(f);
    setContent("");
    setContentErr(null);
    setLoadingContent(true);
    invoke<string>("read_md", { path: f.path })
      .then((s) => setContent(s))
      .catch((e) => setContentErr(String(e)))
      .finally(() => setLoadingContent(false));
  }, []);

  const openExternal = (href: string, baseDir: string) => {
    void invoke("open_path", { path: href, base: baseDir }).catch(() => {});
  };

  // 会话工作目录去重
  const projectDirs = useMemo<DirEntry[]>(() => {
    const map = new Map<string, DirEntry>();
    for (const n of nodes) {
      if (n.type !== "claude-session") continue;
      const cwd = typeof n.data?.cwd === "string" ? (n.data.cwd as string).trim() : "";
      if (!cwd) continue;
      const key = normPath(cwd);
      const label = typeof n.data?.label === "string" ? (n.data.label as string) : "";
      const ex = map.get(key);
      if (ex) {
        if (label && !ex.sessions.includes(label)) ex.sessions.push(label);
      } else {
        map.set(key, { path: cwd, title: baseName(cwd), kind: "project", sessions: label ? [label] : [] });
      }
    }
    return [...map.values()];
  }, [nodes]);

  // 公共 reports 目录（拿一次）
  useEffect(() => {
    if (!inTauri()) return;
    invoke<string>("reports_dir").then(setReportsPath).catch(() => {});
  }, []);

  const dirs = useMemo<DirEntry[]>(() => {
    const list = [...projectDirs];
    if (reportsPath) list.push({ path: reportsPath, title: t("公共 · reports"), kind: "public", sessions: [] });
    return list;
  }, [projectDirs, reportsPath, t]);

  // 初次有目录时默认选第一个
  useEffect(() => {
    const first = dirs[0];
    if (!selDir && first) setSelDir(first.path);
  }, [dirs, selDir]);

  // 选目录 → 扫 md
  useEffect(() => {
    if (!selDir || !inTauri()) return;
    let cancelled = false;
    setLoadingFiles(true);
    setListing(null);
    setSelFile(null);
    setContent("");
    invoke<MdListing>("list_md_files", { dir: selDir })
      .then((r) => {
        if (cancelled) return;
        setListing(r);
        if (r.files[0]) openFile(r.files[0]);
      })
      .catch(() => {
        if (!cancelled) setListing({ dir: selDir, files: [], truncated: false, exists: false });
      })
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selDir, openFile]);

  // 文件按子目录分组
  const groups = useMemo(() => {
    const g = new Map<string, MdFile[]>();
    for (const f of listing?.files ?? []) {
      const d = dirOf(f.rel);
      const arr = g.get(d) ?? [];
      arr.push(f);
      g.set(d, arr);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [listing]);

  const fileDir = selFile
    ? selFile.path.slice(0, Math.max(selFile.path.lastIndexOf("\\"), selFile.path.lastIndexOf("/")))
    : "";

  const mdComponents: Components = {
    a({ href, children }) {
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            if (href) openExternal(href, fileDir);
          }}
        >
          {children}
        </a>
      );
    },
    img({ src, alt }) {
      const s = String(src ?? "");
      if (/^https?:/i.test(s)) return <img src={s} alt={alt ?? ""} />;
      // 本地/相对图片在 webview 里无法直接加载 → 给个可点开的芯片（用默认程序看）
      return (
        <button className="md-img-chip" onClick={() => openExternal(s, fileDir)} title={s}>
          🖼 {alt || baseName(s)}
        </button>
      );
    },
  };

  if (!inTauri()) {
    return createPortal(
      <div className="md-backdrop" onClick={onClose}>
        <div className="md-modal" onClick={(e) => e.stopPropagation()}>
          <div className="panel-empty">{t("Markdown 查看器仅在桌面应用中可用（浏览器开发版不支持）。")}</div>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="md-backdrop" onClick={onClose}>
      <div className="md-modal" onClick={(e) => e.stopPropagation()}>
        <div className="md-head">
          <span className="md-title">📖 {t("Markdown 查看器")}</span>
          <span className="md-sub">{t("查看各会话项目目录下的 Markdown 文档（已渲染）")}</span>
          <button className="md-x" title={t("关闭 (Esc)")} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="md-body">
          <aside className="md-side">
            <div className="md-side-h">{t("切换目录")}</div>
            <div className="md-dirs">
              {dirs.length === 0 && <div className="md-hint">{t("没有可用的会话目录。")}</div>}
              {dirs.map((d) => (
                <button
                  key={d.path}
                  className={`md-dir ${normPath(d.path) === normPath(selDir ?? "") ? "on" : ""} ${d.kind === "public" ? "pub" : ""}`}
                  onClick={() => setSelDir(d.path)}
                  title={d.path}
                >
                  <span className="md-dir-t">
                    {d.kind === "public" ? "📌 " : "📁 "}
                    {d.title}
                  </span>
                  <span className="md-dir-p">{d.sessions.length ? d.sessions.join("、") : d.path}</span>
                </button>
              ))}
            </div>
            <div className="md-side-h">
              {t("文档")}
              {listing?.truncated ? t("（文件过多，已截断）") : ""}
            </div>
            <div className="md-files">
              {loadingFiles && <div className="md-hint">{t("扫描中…")}</div>}
              {!loadingFiles && listing && listing.files.length === 0 && (
                <div className="md-hint">{t("此目录下没有 .md 文件。")}</div>
              )}
              {!loadingFiles &&
                groups.map(([dir, files]) => (
                  <div key={dir || "(root)"} className="md-grp">
                    <div className="md-grp-h" title={dir}>
                      {dir || t("（根目录）")}
                    </div>
                    {files.map((f) => (
                      <button
                        key={f.path}
                        className={`md-file ${selFile?.path === f.path ? "on" : ""}`}
                        onClick={() => openFile(f)}
                        title={f.path}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                ))}
            </div>
          </aside>
          <section className="md-main">
            {!selFile && <div className="panel-empty">{t("← 左侧选一个目录和文件")}</div>}
            {selFile && (
              <>
                <div className="md-main-h">
                  <span className="md-main-name" title={selFile.path}>
                    {selFile.name}
                  </span>
                  <span className="md-main-meta">{fmtSize(selFile.size)}</span>
                  <button className="md-open" onClick={() => openExternal(selFile.path, "")}>
                    {t("用 VSCode 打开")}
                  </button>
                </div>
                <div className="md-render">
                  {loadingContent && <div className="md-hint">{t("加载中…")}</div>}
                  {contentErr && (
                    <div className="panel-empty">
                      {t("读取失败：")}
                      {contentErr}
                    </div>
                  )}
                  {!loadingContent && !contentErr && (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                      {content}
                    </ReactMarkdown>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
