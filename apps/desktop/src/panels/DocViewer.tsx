import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useT } from "../i18n/index.js";

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface DocFile {
  name: string;
  path: string;
  rel: string;
  ext: "md" | "html";
  size: number;
  modifiedMs: number;
}
interface DocListing {
  dir: string;
  files: DocFile[];
  truncated: boolean;
  exists: boolean;
}
interface SessionDir {
  path: string;
  title: string;
  sessions: string[];
}
interface DirEntry extends SessionDir {
  kind: "project" | "public";
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

// ── 目录树（只含 md/html 文件，空目录自然不出现）─────────────────
interface TreeDir {
  name: string;
  path: string;
  dirs: TreeDir[];
  files: DocFile[];
}
function buildTree(files: DocFile[]): TreeDir {
  const root: TreeDir = { name: "", path: "", dirs: [], files: [] };
  const findOrAdd = (parent: TreeDir, name: string, path: string): TreeDir => {
    let d = parent.dirs.find((x) => x.name === name);
    if (!d) {
      d = { name, path, dirs: [], files: [] };
      parent.dirs.push(d);
    }
    return d;
  };
  for (const f of files) {
    const parts = f.rel.split("/");
    parts.pop(); // 文件名
    let cur = root;
    let acc = "";
    for (const seg of parts) {
      acc = acc ? `${acc}/${seg}` : seg;
      cur = findOrAdd(cur, seg, acc);
    }
    cur.files.push(f);
  }
  const sortRec = (d: TreeDir) => {
    d.dirs.sort((a, b) => a.name.localeCompare(b.name));
    d.files.sort((a, b) => a.name.localeCompare(b.name));
    d.dirs.forEach(sortRec);
  };
  sortRec(root);
  return root;
}

function openExternal(href: string, baseDir: string) {
  void invoke("open_path", { path: href, base: baseDir }).catch(() => {});
}

/** Markdown 里的图片：本地相对路径在 webview 加载不了 → 经 Rust 读成 data URL 显示。 */
function MdImage({ src, alt, baseDir }: { src: string; alt: string; baseDir: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (/^(https?:|data:)/i.test(src)) {
      setUrl(src);
      return;
    }
    let cancelled = false;
    invoke<string>("read_file_b64", { path: src, base: baseDir })
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setErr(true));
    return () => {
      cancelled = true;
    };
  }, [src, baseDir]);
  if (err)
    return (
      <span className="md-img-chip" title={src}>
        🖼 {alt || baseName(src)}
      </span>
    );
  if (!url) return <span className="md-img-chip">🖼 …</span>;
  return <img src={url} alt={alt} />;
}

/** 目录树渲染（递归）。 */
function TreeView({
  node,
  depth,
  collapsed,
  toggle,
  selPath,
  onPick,
}: {
  node: TreeDir;
  depth: number;
  collapsed: Set<string>;
  toggle: (p: string) => void;
  selPath: string | null;
  onPick: (f: DocFile) => void;
}) {
  return (
    <>
      {node.dirs.map((d) => {
        const isCol = collapsed.has(d.path);
        return (
          <div key={d.path}>
            <button className="md-tree-dir" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => toggle(d.path)} title={d.path}>
              <span className="md-tw">{isCol ? "▸" : "▾"}</span> 📁 {d.name}
            </button>
            {!isCol && <TreeView node={d} depth={depth + 1} collapsed={collapsed} toggle={toggle} selPath={selPath} onPick={onPick} />}
          </div>
        );
      })}
      {node.files.map((f) => (
        <button
          key={f.path}
          className={`md-tree-file ${selPath === f.path ? "on" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 + 18 }}
          onClick={() => onPick(f)}
          title={f.path}
        >
          {f.ext === "html" ? "🌐 " : "📄 "}
          {f.name}
        </button>
      ))}
    </>
  );
}

/**
 * 文档查看器（独立窗口，label="mdviewer"）。
 * 左：各 Claude 会话工作目录去重 + 公共 reports 目录切换；选中目录后把其下 .md/.html 排成「只含文档的目录树」。
 * 右：.md 渲染（remark-gfm + 原始 HTML + 本地图片）；.html 用沙箱 iframe 原样显示。
 */
export function DocViewer() {
  const t = useT();
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [selDir, setSelDir] = useState<string | null>(null);
  const [listing, setListing] = useState<DocListing | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selFile, setSelFile] = useState<DocFile | null>(null);
  const [content, setContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentErr, setContentErr] = useState<string | null>(null);

  // 跟随主窗主题（localStorage 共享同源）
  useEffect(() => {
    const stored = localStorage.getItem("oblivionis-theme") || "dark";
    const resolved =
      stored === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : stored;
    document.documentElement.setAttribute("data-theme", resolved);
  }, []);

  const loadDirs = useCallback(async (): Promise<DirEntry[]> => {
    if (!inTauri()) return [];
    const sess = await invoke<SessionDir[]>("session_dirs").catch(() => [] as SessionDir[]);
    const list: DirEntry[] = sess.map((s) => ({ ...s, kind: "project" as const }));
    const rep = await invoke<string>("reports_dir").catch(() => "");
    if (rep) list.push({ path: rep, title: t("公共 · reports"), kind: "public", sessions: [] });
    setDirs(list);
    return list;
  }, [t]);

  const openFile = useCallback((f: DocFile) => {
    setSelFile(f);
    setContent("");
    setContentErr(null);
    setLoadingContent(true);
    invoke<string>("read_md", { path: f.path })
      .then((s) => setContent(s))
      .catch((e) => setContentErr(String(e)))
      .finally(() => setLoadingContent(false));
  }, []);

  const loadFiles = useCallback(
    (dir: string, autoOpen: boolean) => {
      if (!inTauri()) return;
      setLoadingFiles(true);
      setListing(null);
      if (autoOpen) {
        setSelFile(null);
        setContent("");
      }
      invoke<DocListing>("list_md_files", { dir })
        .then((r) => {
          setListing(r);
          setCollapsed(new Set());
          if (autoOpen && r.files[0]) openFile(r.files[0]);
        })
        .catch(() => setListing({ dir, files: [], truncated: false, exists: false }))
        .finally(() => setLoadingFiles(false));
    },
    [openFile],
  );

  // 初次加载目录
  useEffect(() => {
    void loadDirs().then((l) => {
      const first = l[0];
      if (first) {
        setSelDir(first.path);
        loadFiles(first.path, true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickDir = (path: string) => {
    setSelDir(path);
    loadFiles(path, true);
  };

  const refresh = () => {
    void loadDirs();
    if (selDir) loadFiles(selDir, false);
  };

  const toggleCol = (p: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const tree = useMemo(() => buildTree(listing?.files ?? []), [listing]);
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
      return <MdImage src={String(src ?? "")} alt={alt ?? ""} baseDir={fileDir} />;
    },
  };

  if (!inTauri()) return <div className="panel-empty">{t("文档查看器仅在桌面应用中可用。")}</div>;

  return (
    <div className="docwin">
      <div className="md-head" data-tauri-drag-region>
        <span className="md-title">📖 {t("文档查看器")}</span>
        <span className="md-sub">{t("各会话项目目录里的 .md / .html（已渲染）")}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="md-open" onClick={refresh} title={t("重新扫描（有新文档时点它）")}>
            {t("刷新")}
          </button>
        </span>
      </div>
      <div className="md-body">
        <aside className="md-side">
          <div className="md-side-h">{t("切换目录")}</div>
          <div className="md-dirs">
            {dirs.length === 0 && <div className="md-hint">{t("没有可用的会话目录。")}</div>}
            {dirs.map((d) => (
              <button
                key={d.path}
                className={`md-dir ${d.path === selDir ? "on" : ""} ${d.kind === "public" ? "pub" : ""}`}
                onClick={() => pickDir(d.path)}
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
              <div className="md-hint">{t("此目录下没有 .md / .html 文档。")}</div>
            )}
            {!loadingFiles && listing && listing.files.length > 0 && (
              <TreeView node={tree} depth={0} collapsed={collapsed} toggle={toggleCol} selPath={selFile?.path ?? null} onPick={openFile} />
            )}
          </div>
        </aside>
        <section className="md-main">
          {!selFile && <div className="panel-empty">{t("← 左侧选一个文档")}</div>}
          {selFile && (
            <>
              <div className="md-main-h">
                <span className="md-main-name" title={selFile.path}>
                  {selFile.ext === "html" ? "🌐 " : "📄 "}
                  {selFile.name}
                </span>
                <span className="md-main-meta">{fmtSize(selFile.size)}</span>
                <button className="md-open" onClick={() => openExternal(selFile.path, "")}>
                  {t("用默认程序打开")}
                </button>
              </div>
              <div className="md-render-wrap">
                {loadingContent && <div className="md-hint">{t("加载中…")}</div>}
                {contentErr && (
                  <div className="panel-empty">
                    {t("读取失败：")}
                    {contentErr}
                  </div>
                )}
                {!loadingContent && !contentErr && selFile.ext === "html" && (
                  <iframe className="md-html" sandbox="allow-same-origin" srcDoc={content} title={selFile.name} />
                )}
                {!loadingContent && !contentErr && selFile.ext === "md" && (
                  <div className="md-render">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
                      {content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
