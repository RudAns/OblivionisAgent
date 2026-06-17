import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

/** 复制文本到剪贴板：webview 优先 navigator.clipboard，失败回退 execCommand。 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
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
  onContext,
}: {
  node: TreeDir;
  depth: number;
  collapsed: Set<string>;
  toggle: (p: string) => void;
  selPath: string | null;
  onPick: (f: DocFile) => void;
  onContext: (e: MouseEvent, f: DocFile) => void;
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
            {!isCol && (
              <TreeView node={d} depth={depth + 1} collapsed={collapsed} toggle={toggle} selPath={selPath} onPick={onPick} onContext={onContext} />
            )}
          </div>
        );
      })}
      {node.files.map((f) => (
        <button
          key={f.path}
          className={`md-tree-file ${selPath === f.path ? "on" : ""}`}
          style={{ paddingLeft: 8 + depth * 14 + 18 }}
          onClick={() => onPick(f)}
          onContextMenu={(e) => onContext(e, f)}
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
  const [menu, setMenu] = useState<{ x: number; y: number; file: DocFile } | null>(null);
  const [copiedTip, setCopiedTip] = useState(false);
  const [selFile, setSelFile] = useState<DocFile | null>(null);
  const [query, setQuery] = useState(""); // 工作区内文件快速搜索
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
        setQuery(""); // 换目录清空搜索
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

  // 懒加载：窗口是「隐藏常驻窗」，启动时别扫盘；首次 show/聚焦再加载（避免每次启动都扫 Unity 大目录）。
  const loadedRef = useRef(false);
  const initRef = useRef<() => void>(() => {});
  initRef.current = () => {
    void loadDirs().then((l) => {
      const first = l[0];
      if (first) {
        setSelDir(first.path);
        loadFiles(first.path, true);
      }
    });
  };
  useEffect(() => {
    if (!inTauri()) return;
    let un: (() => void) | undefined;
    const tryInit = () => {
      if (!loadedRef.current) {
        loadedRef.current = true;
        initRef.current();
      }
    };
    const w = getCurrentWindow();
    w.onFocusChanged(({ payload }) => payload && tryInit())
      .then((u) => (un = u))
      .catch(() => {});
    // 兜底：若窗口已可见（理论上启动时隐藏，不会命中）
    w.isVisible().then((v) => v && tryInit()).catch(() => {});
    return () => un?.();
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
  // 近期修改：按 mtime 取前 8
  const recent = useMemo(
    () => [...(listing?.files ?? [])].sort((a, b) => b.modifiedMs - a.modifiedMs).slice(0, 8),
    [listing],
  );
  // 工作区内搜索：按文件名/相对路径过滤；名字命中优先，再按 mtime
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [] as DocFile[];
    return (listing?.files ?? [])
      .filter((f) => f.name.toLowerCase().includes(q) || f.rel.toLowerCase().includes(q))
      .sort((a, b) => {
        const an = a.name.toLowerCase().includes(q) ? 0 : 1;
        const bn = b.name.toLowerCase().includes(q) ? 0 : 1;
        return an - bn || b.modifiedMs - a.modifiedMs;
      })
      .slice(0, 200);
  }, [listing, q]);
  // 相对时间（近期修改用）
  const fmtAgo = (ms: number): string => {
    const diff = Date.now() - ms;
    if (diff < 60_000) return t("刚刚");
    const m = Math.floor(diff / 60_000);
    if (m < 60) return t("{0} 分钟前", m);
    const h = Math.floor(m / 60);
    if (h < 24) return t("{0} 小时前", h);
    const d = Math.floor(h / 24);
    if (d < 7) return t("{0} 天前", d);
    const dt = new Date(ms);
    return `${dt.getMonth() + 1}-${String(dt.getDate()).padStart(2, "0")}`;
  };
  const fileDir = selFile
    ? selFile.path.slice(0, Math.max(selFile.path.lastIndexOf("\\"), selFile.path.lastIndexOf("/")))
    : "";

  const copyPath = (p: string) => {
    void copyText(p).then((ok) => {
      if (ok) {
        setCopiedTip(true);
        window.setTimeout(() => setCopiedTip(false), 1200);
      }
    });
  };
  const onFileContext = (e: MouseEvent, f: DocFile) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, file: f });
  };

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
          {!loadingFiles && listing && listing.files.length > 0 && (
            <div className="md-search">
              <span className="md-search-ic">🔍</span>
              <input
                className="md-search-in"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("搜索本工作区文件…")}
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setQuery("");
                  if (e.key === "Enter" && results[0]) openFile(results[0]);
                }}
              />
              {query && (
                <button className="md-search-x" onClick={() => setQuery("")} title={t("清除")}>
                  ×
                </button>
              )}
            </div>
          )}
          <div className="md-files">
            {loadingFiles && <div className="md-hint">{t("扫描中…")}</div>}
            {!loadingFiles && listing && listing.files.length === 0 && (
              <div className="md-hint">{t("此目录下没有 .md / .html 文档。")}</div>
            )}
            {/* 搜索态：扁平结果（带所在文件夹） */}
            {!loadingFiles &&
              listing &&
              listing.files.length > 0 &&
              q &&
              (results.length === 0 ? (
                <div className="md-hint">{t("没有匹配「{0}」的文件", query)}</div>
              ) : (
                <>
                  <div className="md-grp-h">{t("搜索结果 · {0}", results.length)}</div>
                  {results.map((f) => (
                    <button
                      key={f.path}
                      className={`md-frow ${selFile?.path === f.path ? "on" : ""}`}
                      onClick={() => openFile(f)}
                      onContextMenu={(e) => onFileContext(e, f)}
                      title={f.path}
                    >
                      <span className="nm">
                        {f.ext === "html" ? "🌐 " : "📄 "}
                        {f.name}
                      </span>
                      {f.rel.includes("/") && <span className="meta">{f.rel.slice(0, f.rel.lastIndexOf("/"))}</span>}
                    </button>
                  ))}
                </>
              ))}
            {/* 非搜索态：近期修改 + 全部文档树 */}
            {!loadingFiles && listing && listing.files.length > 0 && !q && (
              <>
                {recent.length > 0 && (
                  <>
                    <div className="md-grp-h">🕒 {t("近期修改")}</div>
                    {recent.map((f) => (
                      <button
                        key={`r-${f.path}`}
                        className={`md-frow ${selFile?.path === f.path ? "on" : ""}`}
                        onClick={() => openFile(f)}
                        onContextMenu={(e) => onFileContext(e, f)}
                        title={f.path}
                      >
                        <span className="nm">
                          {f.ext === "html" ? "🌐 " : "📄 "}
                          {f.name}
                        </span>
                        <span className="meta">{fmtAgo(f.modifiedMs)}</span>
                      </button>
                    ))}
                  </>
                )}
                <div className="md-grp-h">📁 {t("全部文档")}</div>
                <TreeView
                  node={tree}
                  depth={0}
                  collapsed={collapsed}
                  toggle={toggleCol}
                  selPath={selFile?.path ?? null}
                  onPick={openFile}
                  onContext={onFileContext}
                />
              </>
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
                <span className="md-actions">
                  <button className="md-open" onClick={() => copyPath(selFile.path)} title={selFile.path}>
                    {copiedTip ? t("已复制 ✓") : t("复制路径")}
                  </button>
                  <button className="md-open" onClick={() => openExternal(selFile.path, "")}>
                    {t("用默认程序打开")}
                  </button>
                </span>
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

      {menu &&
        createPortal(
          <div
            className="ctx-backdrop"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          >
            <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
              <button
                className="ctx-item"
                onClick={() => {
                  copyPath(menu.file.path);
                  setMenu(null);
                }}
              >
                {t("复制路径")}
              </button>
              <button
                className="ctx-item"
                onClick={() => {
                  openExternal(menu.file.path, "");
                  setMenu(null);
                }}
              >
                {t("用默认程序打开")}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
