import { useEffect, useRef, useState } from "react";
import { Terminal, type ILink } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface TermInfo {
  nodeId: string;
  label: string;
  cwd: string;
  bin: string;
  sid: string;
}

function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * 单个持久化终端：只在挂载时创建一次 xterm + PTY；切到别的终端/标签只是隐藏(display:none)，
 * 不销毁、不关闭 PTY —— 所以会话状态一直保活。只有显式关闭(从父组件移除)才 dispose。
 */
function TerminalView({
  info,
  active,
  repaintTick,
}: {
  info: TermInfo;
  active: boolean;
  repaintTick: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ptyIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hostRef.current || !inTauri()) return;
    const host = hostRef.current;

    const term = new Terminal({
      fontSize: 14,
      // 英文等宽用 Cascadia Mono；中文优先 Noto Sans SC(思源黑体，Windows 上最接近 macOS 苹方)，回退微软雅黑
      fontFamily:
        "'Cascadia Mono', 'Cascadia Code', Consolas, 'Noto Sans SC', 'Microsoft YaHei', 'Courier New', monospace",
      fontWeight: 400,
      // 行高全局统一（xterm 无法只调某些行）；1.05 让相邻文字行更透气
      lineHeight: 1.05,
      letterSpacing: 0,
      cursorBlink: true,
      scrollback: 8000,
      theme: {
        background: "#1b1e24",
        foreground: "#e6e6e6",
        cursor: "#4f8cff",
        selectionBackground: "#33558855",
      },
    });
    termRef.current = term;
    const fit = new FitAddon();
    fitRef.current = fit;
    term.loadAddon(fit);
    term.open(host);

    // WebGL 渲染器。中文乱码的根因(图集页合并损坏)已由上游 xterm PR #5883 修复，
    // 我们锁定在包含该修复的 6.1-beta/0.20-beta 构建(与 VS Code 消费同一渠道)，无需再定时刷图集。
    let webgl: WebglAddon | null = null;
    try {
      // customGlyphs:false → 制表符(─╭╮╰╯等)改用字体渲染而非矢量自定义字形。
      // 实测(pty_diamond)claude 输出里没有任何菱形字符，分隔线上漂浮的 ◇ 是
      // 自定义字形在非整数行高(1.05)+WebGL 下画歪的产物；Cascadia 字体自带完整制表符。
      webgl = new WebglAddon({ customGlyphs: false });
      webgl.onContextLoss(() => {
        try {
          webgl?.dispose();
        } catch {
          /* ignore */
        }
        webgl = null;
      });
      term.loadAddon(webgl);
    } catch {
      webgl = null; // WebGL 不可用则回退默认 DOM 渲染器
    }
    fit.fit();
    term.writeln(
      "\x1b[90m交互式 Claude 终端（Ctrl+V 粘贴 · Ctrl+A 选中输入框 · Ctrl+C 复制选区/否则中断 · Shift+Enter 换行 · 右键复制或粘贴）\x1b[0m",
    );

    let ptyId: string | null = null;
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];

    const doPaste = () => {
      navigator.clipboard
        .readText()
        .then((t) => t && term.paste(t))
        .catch(() => {});
    };
    const doCopy = () => {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
    };
    // 贴图：剪贴板里若是图片，存成临时文件并把路径插入输入框（claude 用 Read 工具读图）。
    // 返回 true=确实贴了图；false=不是图片(交给文字粘贴)。
    const tryPasteImage = async (): Promise<boolean> => {
      try {
        if (!navigator.clipboard?.read) return false;
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const type = it.types.find((t) => t.startsWith("image/"));
          if (!type) continue;
          const bytes = new Uint8Array(await (await it.getType(type)).arrayBuffer());
          let bin = "";
          const CH = 0x8000;
          for (let i = 0; i < bytes.length; i += CH)
            bin += String.fromCharCode(...bytes.subarray(i, i + CH));
          const ext =
            (type.split("/")[1] || "png").toLowerCase().replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") ||
            "png";
          const path = await invoke<string>("save_paste_image", { b64: btoa(bin), ext });
          const id = ptyIdRef.current;
          if (id && path) await invoke("pty_write", { id, data: path + " " });
          return true;
        }
      } catch {
        /* 剪贴板不可读/非图片：忽略，走文字粘贴 */
      }
      return false;
    };

    // Ctrl+A："全选输入框"。TUI 没有真正的选区概念，这里在 xterm 层识别底部输入框
    // (❯/> 提示行 + 上下横线边框)并把框内文本选中——随后 Ctrl+C 即可复制。
    // 识别失败则把 ^A 原样交给 claude(光标回行首)。
    const selectInputBox = (): boolean => {
      const buf = term.buffer.active;
      const top = buf.viewportY;
      const texts: string[] = [];
      for (let r = 0; r < term.rows; r++) {
        texts.push(buf.getLine(top + r)?.translateToString(true) ?? "");
      }
      const isRule = (s: string) => {
        const t = s.trim();
        if (t.length < 8) return false;
        let n = 0;
        for (const ch of t) if ("─—═◇╌┄-".includes(ch)) n++;
        return n / t.length > 0.6;
      };
      let promptRow = -1;
      for (let r = term.rows - 1; r >= 0; r--) {
        const t = (texts[r] ?? "").trimStart();
        if (t.startsWith("❯") || t.startsWith(">")) {
          promptRow = r;
          break;
        }
      }
      if (promptRow < 0) return false;
      let topRule = -1;
      for (let r = promptRow - 1; r >= 0; r--)
        if (isRule(texts[r] ?? "")) {
          topRule = r;
          break;
        }
      let botRule = term.rows;
      for (let r = promptRow + 1; r < term.rows; r++)
        if (isRule(texts[r] ?? "")) {
          botRule = r;
          break;
        }
      const startRow = topRule + 1;
      let endRow = Math.min(botRule - 1, term.rows - 1);
      while (endRow > promptRow && !(texts[endRow] ?? "").trim()) endRow--;
      const promptIdx = (texts[promptRow] ?? "").search(/[❯>]/);
      const startCol = startRow === promptRow ? promptIdx + 2 : 0;
      const lastLen = (texts[endRow] ?? "").replace(/\s+$/, "").length;
      const length = (endRow - startRow) * term.cols + lastLen - startCol;
      if (length <= 0) return false;
      term.select(startCol, top + startRow, length);
      return term.hasSelection();
    };

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const ctrl = e.ctrlKey || e.metaKey;
      // Ctrl+A → 选中输入框内容(可接 Ctrl+C 复制)；识别不到则放行 ^A(claude 里=光标回行首)
      if (ctrl && !e.shiftKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        if (selectInputBox()) return false;
        return true;
      }
      // Ctrl+V：先看是不是图片(异步存文件+插路径)；文字则交给浏览器原生 paste 粘一次。return false 抑制 ^V。
      if (ctrl && !e.shiftKey && (e.key === "v" || e.key === "V")) {
        void tryPasteImage();
        return false;
      }
      if (ctrl && !e.shiftKey && (e.key === "c" || e.key === "C")) {
        if (term.hasSelection()) {
          doCopy();
          term.clearSelection();
          return false;
        }
        return true;
      }
      if (ctrl && e.shiftKey && (e.key === "c" || e.key === "C")) {
        doCopy();
        return false;
      }
      // Shift+Enter：直接送 ESC+CR —— 实测(pty_nl)单独这串字节 claude 会插入软换行、不提交。
      // 关键：必须 e.preventDefault() 拦掉这次 Enter 的浏览器默认动作，否则 xterm/textarea 会再补发一个
      // 裸 \r 把消息提交掉（实测 "\x1b\r\r" 就会：换行后立刻回车发出去）。return false 只挡 xterm 自身、挡不住默认动作。
      if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        const id = ptyIdRef.current;
        if (id) invoke("pty_write", { id, data: "\x1b\r" }).catch(() => {});
        return false;
      }
      return true;
    });

    const onContextMenu = (ev: globalThis.MouseEvent) => {
      ev.preventDefault();
      if (term.hasSelection()) {
        doCopy();
        term.clearSelection();
        return;
      }
      // 右键无选区：先试贴图，不是图片再贴文字
      void tryPasteImage().then((done) => {
        if (!done) doPaste();
      });
    };
    host.addEventListener("contextmenu", onContextMenu);

    // 可点击路径：.md 点击→VSCode 打开、.html 点击→浏览器打开（仅点击时打开，不自动打开）
    term.registerLinkProvider({
      provideLinks(line: number, callback: (links: ILink[] | undefined) => void) {
        const buf = term.buffer.active.getLine(line - 1);
        if (!buf) {
          callback(undefined);
          return;
        }
        // 逐 cell 重建该行文本，并记录每个字符所在的终端列（正确处理中文等双宽字符）
        let text = "";
        const colAt: number[] = [];
        for (let col = 0; col < buf.length; ) {
          const cell = buf.getCell(col);
          const w = cell ? cell.getWidth() : 1;
          if (!cell || w === 0) {
            col += 1;
            continue;
          }
          const s = cell.getChars() || " ";
          for (let k = 0; k < s.length; k++) colAt.push(col);
          text += s;
          col += w;
        }
        const re =
          /(?:[A-Za-z]:[\\/][^\s"'`<>|*?]+|\.{0,2}[\\/]?[\w.\-][\w.\-\\/]*)\.(?:md|markdown|html?|htm)\b/gi;
        const links: ILink[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const matched = m[0];
          const sCol = colAt[m.index] ?? 0;
          const eCol = colAt[m.index + matched.length - 1] ?? sCol;
          links.push({
            range: { start: { x: sCol + 1, y: line }, end: { x: eCol + 1, y: line } },
            text: matched,
            activate: () => {
              void invoke("open_path", { path: matched, base: info.cwd || "" }).catch(() => {});
            },
          });
        }
        callback(links.length ? links : undefined);
      },
    });

    (async () => {
      // 关键：pty_open 返回前 ptyId 还是 null，而 --resume 时 claude 一启动就猛吐历史。
      // 这些早到的输出先缓存，拿到 ptyId 后再回放，否则历史会被直接丢弃（=终端只剩头部那行）。
      const earlyBuffer: { id: string; data: string }[] = [];
      let exited = false;
      unlisteners.push(
        await listen<{ id: string; data: string }>("pty-data", (e) => {
          if (ptyId === null) {
            earlyBuffer.push(e.payload);
            return;
          }
          if (e.payload.id === ptyId) term.write(e.payload.data);
        }),
      );
      unlisteners.push(
        await listen<{ id: string }>("pty-exit", (e) => {
          // ptyId 已知就按 id 匹配；还没拿到 id 就退出=秒退，也照样提示
          if (ptyId === null || e.payload.id === ptyId) {
            exited = true;
            term.writeln("\r\n\x1b[90m[进程已退出]\x1b[0m");
          }
        }),
      );
      if (disposed) return;
      try {
        // 等两帧让布局先稳定，再量取真实尺寸——刚挂载瞬间 fit() 量到的常是偏小的中间值
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        if (disposed) return;
        try {
          fit.fit();
        } catch {
          /* ignore */
        }
        const openedCols = term.cols;
        const openedRows = term.rows;
        ptyId = await invoke<string>("pty_open", {
          cwd: info.cwd || ".",
          bin: info.bin || "claude",
          sid: info.sid || "",
          cols: openedCols,
          rows: openedRows,
        });
        ptyIdRef.current = ptyId;
        // 回放拿到 id 之前缓存的输出（--resume 的历史就在这一批里）
        if (!exited) {
          for (const p of earlyBuffer) if (p.id === ptyId) term.write(p.data);
        }
        earlyBuffer.length = 0;
        // 补发竞态期间丢失的尺寸：pty_open 进行中 ResizeObserver 触发的 onResize 会因 ptyId===null
        // 跳过 pty_resize，claude 就一直按打开时的旧列数渲染(输入框画在 2/3 宽度处)。这里对账一次。
        if (term.cols !== openedCols || term.rows !== openedRows) {
          invoke("pty_resize", { id: ptyId, cols: term.cols, rows: term.rows }).catch(() => {});
        }
      } catch (err) {
        term.writeln(`\r\n\x1b[31m打开终端失败: ${String(err)}\x1b[0m`);
      }
    })();

    const inputDisp = term.onData((data) => {
      if (ptyId) invoke("pty_write", { id: ptyId, data }).catch(() => {});
    });
    const onResize = () => {
      // 隐藏(display:none)时容器为 0 尺寸——别 fit/resize，否则会把 PTY 缩成极小、切回来时 claude TUI 错乱重影
      if (!host.clientWidth || !host.clientHeight) return;
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
      if (ptyId) invoke("pty_resize", { id: ptyId, cols: term.cols, rows: term.rows }).catch(() => {});
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => onResize());
    ro.observe(host);

    // 只有真正卸载(从父组件移除=显式关闭)才会跑到这里：关 PTY + 销毁
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      host.removeEventListener("contextmenu", onContextMenu);
      try {
        ro.disconnect();
      } catch {
        /* ignore */
      }
      try {
        inputDisp.dispose();
      } catch {
        /* ignore */
      }
      unlisteners.forEach((u) => {
        try {
          u();
        } catch {
          /* ignore */
        }
      });
      if (ptyId) invoke("pty_close", { id: ptyId }).catch(() => {});
      try {
        webgl?.dispose();
      } catch {
        /* ignore */
      }
      webgl = null;
      try {
        term.dispose();
      } catch {
        /* ignore */
      }
    };
    // 故意空依赖：终端只创建一次，cwd/sid 在首次打开时定型（运行中的会话）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 变为可见时：等布局稳定后重新拟合尺寸并重绘缓冲。
  // 注意：绝不做"resize 抖动"去逼 claude 重排——每次重排都会在 scrollback 留残行，
  // 快速左右切换时残行叠加=错乱。真正的根因(零尺寸 resize、WebGL 图集损坏)已分别由
  // onResize 的零尺寸守卫和 xterm 上游修复(#5883)解决；这里只需 fit + 重绘 + 聚焦。
  // 只有尺寸真的变了(比如切走期间拖动了面板宽度)才通知 PTY。
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => {
      const t = termRef.current;
      const f = fitRef.current;
      const h = hostRef.current;
      if (!t || !f || !h || !h.clientWidth || !h.clientHeight) return;
      const prevCols = t.cols;
      const prevRows = t.rows;
      try {
        f.fit();
      } catch {
        /* ignore */
      }
      const id2 = ptyIdRef.current;
      if (id2 && (t.cols !== prevCols || t.rows !== prevRows)) {
        invoke("pty_resize", { id: id2, cols: t.cols, rows: t.rows }).catch(() => {});
      }
      try {
        t.refresh(0, t.rows - 1);
      } catch {
        /* ignore */
      }
      t.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [active]);

  // 手动「重绘」：一次性高度抖动(行数-1→恢复)逼 claude 整屏重画，清掉直播输出时偶发的叠印残影。
  // 用高度而非宽度：高度变化不触发长行重折行，不会往滚动缓冲塞残行。自动抖动禁止(见 pitfalls C3/C9)。
  useEffect(() => {
    if (!active || repaintTick === 0) return;
    const t = termRef.current;
    const id = ptyIdRef.current;
    if (!t || !id) return;
    invoke("pty_resize", { id, cols: t.cols, rows: Math.max(2, t.rows - 1) })
      .then(() => invoke("pty_resize", { id, cols: t.cols, rows: t.rows }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repaintTick]);

  return <div className="terminal-host" style={{ display: active ? "block" : "none" }} ref={hostRef} />;
}

/**
 * 多终端容器：保活所有已打开的终端（隐藏非激活的），顶部一排标签切换/关闭。
 */
export function TerminalsHost({
  terminals,
  activeId,
  onActivate,
  onClose,
}: {
  terminals: TermInfo[];
  activeId: string | null;
  onActivate: (nodeId: string) => void;
  onClose: (nodeId: string) => void;
}) {
  // 手动重绘信号：点按钮 +1，当前激活的终端做一次高度抖动让 claude 整屏重画
  const [repaintTick, setRepaintTick] = useState(0);
  if (!inTauri()) return <div className="panel-empty">真实终端仅在桌面应用中可用（浏览器开发版不支持）。</div>;
  if (terminals.length === 0)
    return (
      <div className="panel-empty">
        双击画布上的「Claude 会话」节点打开终端。多个终端会同时保活，切换/切标签都不会关闭。
      </div>
    );
  return (
    <div className="terms-wrap">
      <div className="term-tabs">
        {terminals.map((t) => (
          <div
            key={t.nodeId}
            className={`term-tab ${t.nodeId === activeId ? "on" : ""}`}
            onClick={() => onActivate(t.nodeId)}
            title={t.cwd || t.nodeId}
          >
            <span className="term-tab-label">{t.label}</span>
            <button
              className="term-tab-x"
              title="关闭此终端"
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.nodeId);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="term-repaint"
          title="重绘当前终端（清理偶发的叠印残影）"
          onClick={() => setRepaintTick((n) => n + 1)}
        >
          ⟳
        </button>
      </div>
      <div className="terms-body">
        {terminals.map((t) => (
          <TerminalView
            key={t.nodeId}
            info={t}
            active={t.nodeId === activeId}
            repaintTick={t.nodeId === activeId ? repaintTick : 0}
          />
        ))}
      </div>
    </div>
  );
}
