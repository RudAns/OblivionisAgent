import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  applyNodeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type NodeMouseHandler,
  type OnConnectEnd,
} from "@xyflow/react";
import { getHelperLines } from "./canvas/helper-lines.js";
import { AlignBar, type AlignKind } from "./canvas/AlignBar.js";
import {
  DEFAULT_WS_PORT,
  type OblivionisConfig,
  type GraphNode,
  type ClaudeStreamEvent,
  type SessionInfo,
  type Owner,
  type UsageSnapshot,
  type CostSnapshot,
  type KnowledgeItem,
} from "@oblivionis/shared";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, currentMonitor, ProgressBarStatus } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { listen as tauriListen, emit as tauriEmit } from "@tauri-apps/api/event";
import { BridgeClient } from "./bridge-client.js";
import { FlowCanvas } from "./canvas/FlowCanvas.js";
import { TranscriptPanel } from "./panels/TranscriptPanel.js";
import { TerminalsHost, type TermInfo } from "./panels/TerminalsHost.js";
import { LogPanel, type LogLine } from "./panels/LogPanel.js";
import { AuditPanel, type AuditItem } from "./panels/AuditPanel.js";
import { InboxPanel } from "./panels/InboxPanel.js";
import { CostPanel } from "./panels/CostPanel.js";
import { FeishuPanel, FeishuStatusDot, type FeishuState } from "./panels/FeishuPanel.js";
import { IconRail, type RailKey } from "./layout/IconRail.js";
import { useI18n, useT, tStatic, type Lang } from "./i18n/index.js";
import { IconMoon, IconSun, IconMonitor } from "./layout/icons.js";
import { SessionSidebar } from "./layout/SessionSidebar.js";
import { StatusBar } from "./layout/StatusBar.js";
import { StatsChip, StatusChip, type StatsData, type StatusData } from "./layout/GlanceChips.js";

type Tab = "transcript" | "terminal" | "audit" | "logs" | "inbox";
type ThemePref = "dark" | "light" | "system";

const NEW_NODE_DEFAULTS: Record<string, () => Omit<GraphNode, "id" | "position">> = {
  "feishu-group": () => ({
    kind: "feishu-group",
    label: "新群",
    data: { chatId: "", triggerMode: "mention" },
  }),
  route: () => ({
    kind: "route",
    label: "路由",
    data: {},
  }),
  "intent-switch": () => ({
    kind: "intent-switch",
    label: "意图分流",
    data: { mode: "best" },
  }),
  "claude-session": () => ({
    kind: "claude-session",
    label: "新会话",
    data: {
      cwd: "",
      permissionMode: "default",
      guestPermissionMode: "default",
      includePartialMessages: true,
      extraArgs: [],
      approvalMode: false,
    },
  }),
  cron: () => ({
    kind: "cron",
    label: "定时任务",
    data: { schedule: "09:00", prompt: "", enabled: true },
  }),
  soul: () => ({
    kind: "soul",
    label: "人格",
    data: {},
  }),
  skill: () => ({
    kind: "skill",
    label: "技能",
    data: {},
  }),
  subagent: () => ({
    kind: "subagent",
    label: "子代理",
    data: {},
  }),
  webhook: () => ({
    kind: "webhook",
    label: "Webhook",
    data: {
      token: crypto.randomUUID().replace(/-/g, ""),
      prompt: "收到一个 webhook 事件，请简要分析以下内容并用中文总结：\n{{body}}",
      enabled: true,
    },
  }),
};

// 自绘窗口控件（最小化/最大化/关闭）——无边框窗口(decorations:false)用，融进顶栏
function WindowControls() {
  const t = useT();
  const act = (fn: "minimize" | "toggleMaximize" | "close") => {
    try {
      void getCurrentWindow()[fn]();
    } catch {
      /* 浏览器开发版无窗口 API */
    }
  };
  return (
    <div className="win-ctrls">
      <button className="win-btn" title={t("最小化")} onClick={() => act("minimize")}>
        <svg width="11" height="11" viewBox="0 0 16 16">
          <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      <button className="win-btn" title={t("最大化 / 还原")} onClick={() => act("toggleMaximize")}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      <button className="win-btn win-close" title={t("关闭")} onClick={() => act("close")}>
        <svg width="11" height="11" viewBox="0 0 16 16">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// 复制/粘贴/再制时清掉节点的「身份」字段，避免与原节点冲突(同一会话/群/token)
function clearedNodeData(node: Node, addSuffix: boolean): Record<string, unknown> {
  const data: Record<string, unknown> = { ...(node.data as Record<string, unknown>) };
  if (node.type === "claude-session") delete data.sessionId;
  if (node.type === "feishu-group") data.chatId = "";
  if (node.type === "webhook") data.token = crypto.randomUUID().replace(/-/g, "");
  if (addSuffix && typeof data.label === "string") data.label = `${data.label} 副本`;
  return data;
}

// 工具条 / 右键「添加节点」菜单共用的节点清单（kind → 中文名）
const PALETTE: [keyof typeof NEW_NODE_DEFAULTS, string][] = [
  ["feishu-group", "飞书群"],
  ["route", "路由"],
  ["intent-switch", "意图分流"],
  ["claude-session", "Claude 会话"],
  ["cron", "定时任务"],
  ["webhook", "Webhook"],
  ["soul", "人格"],
  ["skill", "技能"],
  ["subagent", "子代理"],
];
// kind → 本地化名（检视标题等用，避免直接显示原始 "claude-session"）
const NODE_LABEL: Record<string, string> = Object.fromEntries(PALETTE);

// 「＋ 添加节点」下拉的分组(参考美术稿)：输入源 / 路由与决策 / 执行节点 / 辅助。
// icon 与节点卡片一致；color 取节点代表色，给菜单图标上色。
const ADD_GROUPS: {
  title: string;
  items: { kind: keyof typeof NEW_NODE_DEFAULTS; label: string; icon: string; color: string }[];
}[] = [
  {
    title: "输入源",
    items: [
      { kind: "feishu-group", label: "飞书群", icon: "💬", color: "#3b9b70" },
      { kind: "webhook", label: "Webhook", icon: "🪝", color: "#b7791f" },
    ],
  },
  {
    title: "路由与决策",
    items: [
      { kind: "intent-switch", label: "意图分流", icon: "🧠", color: "#c68a32" },
      { kind: "route", label: "路由", icon: "🔀", color: "#8167b2" },
    ],
  },
  {
    title: "执行节点",
    items: [
      { kind: "claude-session", label: "Claude 会话", icon: "🤖", color: "#d96745" },
      { kind: "cron", label: "定时任务", icon: "⏰", color: "#3a8fa0" },
    ],
  },
  {
    title: "辅助",
    items: [
      { kind: "soul", label: "人格", icon: "🎭", color: "#9d7bc9" },
      { kind: "skill", label: "技能", icon: "🧩", color: "#3a8fa0" },
      { kind: "subagent", label: "子代理", icon: "🦾", color: "#c0517a" },
    ],
  },
];
// kind → 代表色 / 图标(节点检视浮窗的彩色头部用，避免纯白无特征)
const NODE_COLOR: Record<string, string> = {
  "feishu-group": "#3b9b70",
  route: "#8167b2",
  "intent-switch": "#c68a32",
  "claude-session": "#d96745",
  cron: "#3a8fa0",
  webhook: "#b7791f",
  soul: "#9d7bc9",
  skill: "#3a8fa0",
  subagent: "#c0517a",
};
const NODE_ICON: Record<string, string> = {
  "feishu-group": "💬",
  route: "🔀",
  "intent-switch": "🧠",
  "claude-session": "🤖",
  cron: "⏰",
  webhook: "🪝",
  soul: "🎭",
  skill: "🧩",
  subagent: "🦾",
};

// 从某类节点的「输出口」拖到空白处时，能落地的目标类型（与 FlowCanvas 连线校验同源）。
// handle=目标节点上要落的入口(claude-session 的人格口为 "fork")，默认走主入口。
function dropTargetsFor(
  sourceKind: string | undefined,
): { kind: keyof typeof NEW_NODE_DEFAULTS; handle?: string }[] {
  if (sourceKind === "soul" || sourceKind === "skill" || sourceKind === "subagent")
    return [{ kind: "claude-session", handle: "fork" }];
  if (sourceKind === "cron" || sourceKind === "webhook") return [{ kind: "claude-session" }];
  if (sourceKind === "feishu-group" || sourceKind === "route" || sourceKind === "intent-switch")
    return [{ kind: "route" }, { kind: "intent-switch" }, { kind: "claude-session" }];
  return [];
}

function graphToRf(config: OblivionisConfig, status: Record<string, string>): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = config.graph.nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: n.position,
    data: { ...n.data, label: n.label, status: status[n.id] ?? "idle" },
  }));
  const kindOf = new Map(config.graph.nodes.map((n) => [n.id, n.kind] as const));
  const edges: Edge[] = config.graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null, // 人格连到会话的「原始口/Fork口」靠它区分
    // 条件不再用内置 label（改由 ConditionEdge 的可点徽标显示）；sourceKind 决定空条件时是否提示「＋意图」
    data: { condition: e.condition, sourceKind: kindOf.get(e.source) },
  }));
  return { nodes, edges };
}

function rfToGraph(nodes: Node[], edges: Edge[]): OblivionisConfig["graph"] {
  return {
    nodes: nodes.map((n) => {
      const { label, status, ...data } = n.data as Record<string, unknown>;
      void status;
      return {
        id: n.id,
        kind: n.type as GraphNode["kind"],
        position: n.position,
        label: String(label ?? n.id),
        data,
      } as GraphNode;
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      condition: ((e.data as { condition?: string } | undefined)?.condition || undefined),
    })),
  };
}

function Inner() {
  const client = useMemo(() => new BridgeClient(`ws://127.0.0.1:${DEFAULT_WS_PORT}`), []);
  const rf = useReactFlow();
  const [config, setConfig] = useState<OblivionisConfig | null>(null);
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  // 拖动节点时的对齐参考线（画布坐标）；空对象=当前无对齐
  const [helperLines, setHelperLines] = useState<{ horizontal?: number; vertical?: number }>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  // 右键菜单（节点/连线/空白）：x,y=屏幕坐标；flow=空白处右键时的画布坐标(用于在原位加节点)
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    kind: "node" | "edge" | "pane";
    id?: string;
    flow?: { x: number; y: number };
  } | null>(null);
  // 从输出口拖到空白处：弹出「可连的节点类型」菜单，选一个自动建好并连上
  const [dropMenu, setDropMenu] = useState<{
    sx: number;
    sy: number;
    flowPos: { x: number; y: number };
    srcId: string;
    opts: { kind: keyof typeof NEW_NODE_DEFAULTS; handle?: string }[];
  } | null>(null);
  // Ctrl+K 命令面板
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [cmdkQuery, setCmdkQuery] = useState("");
  const [cmdkIndex, setCmdkIndex] = useState(0);
  // 画布左上角「＋ 添加节点」下拉菜单
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  // 剪贴板里是否有内容（驱动右键菜单的「粘贴」是否出现）
  const [hasClipboard, setHasClipboard] = useState(false);
  const [tab, setTab] = useState<Tab>("transcript");
  // 会话视图"粘滞"：记住上次在看会话的哪种视图(终端/转录)，切会话时沿用、不强制跳终端
  const [lastSessionView, setLastSessionView] = useState<"terminal" | "transcript">("terminal");
  // 国际化：t() 翻译界面文案(中文原文即 key，漏译回退中文)；lang/setLang 给设置里的语言切换器
  const { t, lang, setLang } = useI18n();
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [inbox, setInbox] = useState<AuditItem[]>([]);
  const [feishu, setFeishu] = useState<FeishuState>({ status: "disconnected" });
  const [unrouted, setUnrouted] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [openidResult, setOpenidResult] = useState<{
    items: Array<{ label: string; openId: string }>;
    error?: string;
  } | null>(null);
  const [testText, setTestText] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(() => {
    try {
      return localStorage.getItem("oblivionis.canvasCollapsed") !== "1"; // 启动若是折叠态，不自动弹节点编辑
    } catch {
      return true;
    }
  });
  const [feishuOpen, setFeishuOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(480);
  // 连线画布折叠态（记住到 localStorage）：折叠后左侧变成 Claude 会话卡片窄菜单，给终端腾空间
  const [canvasCollapsed, setCanvasCollapsedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("oblivionis.canvasCollapsed") === "1";
    } catch {
      return false;
    }
  });
  const setCanvasCollapsed = useCallback((v: boolean) => {
    setCanvasCollapsedState(v);
    if (v) setInspectorOpen(false); // 折叠(终端为主)时不自动弹节点编辑，按需点「✎ 编辑节点」再开
    try {
      localStorage.setItem("oblivionis.canvasCollapsed", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const [openedTerminals, setOpenedTerminals] = useState<string[]>([]); // 已打开(保活)的会话节点 id
  const [activeTerminal, setActiveTerminal] = useState<string | null>(null); // 当前显示的终端(独立状态)
  const [termRunning, setTermRunning] = useState<Record<string, boolean>>({}); // 各会话终端是否在跑(输出活动)
  const [unseenDone, setUnseenDone] = useState<Record<string, boolean>>({}); // 完成但用户还没切过去看 → 红点
  // 运行时点亮真实链路：按 runId(每条入站消息) 存，value 带目标会话 nodeId——
  // 这样多个群并发触发同一会话时，多条链路各自独立点亮，互不覆盖。
  const [activePaths, setActivePaths] = useState<Record<string, { nodeId: string; edgeIds: string[] }>>({});
  const [edgeStats, setEdgeStats] = useState<Record<string, { count: number; lastTs: number }>>(() => {
    // C2 运行轨迹：每条连线累计触发次数，持久化在前端
    try {
      return JSON.parse(localStorage.getItem("oblivionis-edge-stats") || "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("oblivionis-edge-stats", JSON.stringify(edgeStats));
    } catch {
      /* ignore */
    }
  }, [edgeStats]);
  // E1b 全局唤起热键：默认关(快捷键易和别的软件冲突)；开了才注册，可改键
  const [hotkeyEnabled, setHotkeyEnabled] = useState<boolean>(
    () => localStorage.getItem("oblivionis-hotkey-enabled") === "1",
  );
  const [hotkeyKey, setHotkeyKey] = useState<string>(
    () => localStorage.getItem("oblivionis-hotkey-key") || "CommandOrControl+Shift+O",
  );
  useEffect(() => {
    localStorage.setItem("oblivionis-hotkey-enabled", hotkeyEnabled ? "1" : "0");
  }, [hotkeyEnabled]);
  useEffect(() => {
    localStorage.setItem("oblivionis-hotkey-key", hotkeyKey);
  }, [hotkeyKey]);
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window) || !hotkeyEnabled || !hotkeyKey.trim()) return;
    const key = hotkeyKey.trim();
    void (async () => {
      try {
        const gs = await import("@tauri-apps/plugin-global-shortcut");
        try {
          if (await gs.isRegistered(key)) await gs.unregister(key);
        } catch {
          /* ignore */
        }
        await gs.register(key, (e) => {
          if (e.state !== "Pressed") return;
          void (async () => {
            try {
              const w = getCurrentWindow();
              await w.show();
              await w.unminimize();
              await w.setFocus();
            } catch {
              /* ignore */
            }
          })();
        });
      } catch (err) {
        console.warn(`[hotkey] 注册「${key}」失败(可能被别的软件占用)：${(err as Error)?.message ?? err}`);
      }
    })();
    return () => {
      void import("@tauri-apps/plugin-global-shortcut").then((gs) => gs.unregister(key).catch(() => {}));
    };
  }, [hotkeyEnabled, hotkeyKey]);
  const [sessionMetas, setSessionMetas] = useState<Record<string, { base?: number; fork?: number }>>({}); // 会话 transcript 最终修改时间
  // 主题：dark/light/system；resolvedTheme 是 system 解析后的实际明暗，传给画布/终端
  const [theme, setTheme] = useState<ThemePref>(() => {
    const t = localStorage.getItem("oblivionis-theme");
    return t === "light" || t === "system" || t === "dark" ? t : "dark";
  });
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(
    () => (document.documentElement.getAttribute("data-theme") as "dark" | "light") || "dark",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeNotice, setThemeNotice] = useState(false); // 切主题后提示"已同步 Claude、需重开终端"
  // 完成任务桌面提示开关：只管「完成时弹不弹右下角小人」。任务栏流光是常驻能力，不归它管。
  const [completionAlert, setCompletionAlert] = useState<boolean>(() => {
    const v = localStorage.getItem("oblivionis-completion-alert");
    return v == null ? true : v === "1";
  });
  useEffect(() => {
    localStorage.setItem("oblivionis-completion-alert", completionAlert ? "1" : "0");
  }, [completionAlert]);
  // 完成小人停留时长(秒)，可调；经 mascot-show 事件传给小人窗口
  const [mascotSec, setMascotSec] = useState<number>(() => {
    const v = Number(localStorage.getItem("oblivionis-mascot-sec"));
    return Number.isFinite(v) && v >= 2 && v <= 30 ? v : 5;
  });
  useEffect(() => {
    localStorage.setItem("oblivionis-mascot-sec", String(mascotSec));
  }, [mascotSec]);
  // 终端字号：设置界面滑杆 + 终端内 Ctrl+/- 共用一个存档；改动广播给所有已开终端实时生效
  const [termFontSize, setTermFontSize] = useState<number>(() => {
    const s = parseInt(localStorage.getItem("oblivionis-term-fontsize") || "", 10);
    return Number.isFinite(s) ? Math.max(9, Math.min(28, s)) : 14;
  });
  useEffect(() => {
    localStorage.setItem("oblivionis-term-fontsize", String(termFontSize));
    window.dispatchEvent(new CustomEvent("oblivionis-term-fontsize", { detail: termFontSize }));
  }, [termFontSize]);
  // 打开设置时重新读一次：终端里用 Ctrl+/- 改过后，滑杆显示最新值
  useEffect(() => {
    if (!settingsOpen) return;
    const s = parseInt(localStorage.getItem("oblivionis-term-fontsize") || "", 10);
    if (Number.isFinite(s)) setTermFontSize(Math.max(9, Math.min(28, s)));
  }, [settingsOpen]);
  const [bridgeUp, setBridgeUp] = useState(false); // 引擎 WS 连接状态（状态栏）
  const [usage, setUsage] = useState<UsageSnapshot | null>(null); // 订阅用量(5h/周)
  const [cost, setCost] = useState<CostSnapshot | null>(null); // 成本看板汇总
  const [costOpen, setCostOpen] = useState(false); // 成本看板浮层（盖在主界面、点外部关）
  const [ctx, setCtx] = useState<{ ctxTokens: number; outTokens: number; model: string; baseTokens: number } | null>(
    null,
  ); // 当前终端会话上下文体量(读 transcript 估算)
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]); // 知识收件箱
  const eventsRef = useRef<Record<string, ClaudeStreamEvent[]>>({});
  const [, forceRender] = useState(0);
  const statusRef = useRef<Record<string, string>>({});
  const activeTermRef = useRef<string | null>(null); // 当前在看的终端(供 WS 回调判断要不要点红点)
  const saveRef = useRef<() => void>(() => {}); // 指向最新 save()，供快捷键 Ctrl+S 调用(避免闭包过期)
  const graphInit = useRef(false);
  const configRef = useRef<OblivionisConfig | null>(null);
  const lastSavedSig = useRef<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false); // 自动保存后状态栏闪一下"已保存 ✓"
  const savedTimer = useRef<number | undefined>(undefined);
  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSavedFlash(false), 1600);
  }, []);
  // 撤销/重做：记录画布"settled"状态历史。防抖记录，仅实质变化(节点/连线/位置/条件)入栈，纯选中不记。
  type GraphSnap = { nodes: Node[]; edges: Edge[]; sig: string };
  const historyRef = useRef<{ past: GraphSnap[]; future: GraphSnap[]; lastSnap: GraphSnap | null; applying: boolean }>(
    { past: [], future: [], lastSnap: null, applying: false },
  );
  const [histState, setHistState] = useState({ canUndo: false, canRedo: false });
  const syncHist = useCallback(() => {
    const h = historyRef.current;
    setHistState({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
  }, []);
  // 每个会话节点的"专属终端会话 id"：避免去 resume 正在用的开发/访客会话(否则报 already in use)
  const termIds = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    client.connect();
    const offConn = client.onConnection(setBridgeUp);
    const off = client.on((msg) => {
      switch (msg.type) {
        case "config": {
          setConfig(msg.config);
          configRef.current = msg.config;
          if (!graphInit.current) {
            const { nodes: n, edges: e } = graphToRf(msg.config, statusRef.current);
            setNodes(n);
            setEdges(e);
            graphInit.current = true;
          } else {
            // 已初始化：绝不再用引擎的图覆盖画布（避免清空未保存改动），仅回填会话 id
            setNodes((cur) => {
              let changed = false;
              const next = cur.map((nd) => {
                const src = msg.config.graph.nodes.find((x) => x.id === nd.id);
                if (src && src.kind === "claude-session") {
                  const sid = (src.data as { sessionId?: string }).sessionId;
                  if (sid && sid !== (nd.data as { sessionId?: string }).sessionId) {
                    changed = true;
                    return { ...nd, data: { ...nd.data, sessionId: sid } };
                  }
                }
                return nd;
              });
              return changed ? next : cur; // 无变化返回同引用，避免触发自动保存循环
            });
          }
          break;
        }
        case "session-event": {
          const arr = eventsRef.current[msg.nodeId] ?? [];
          arr.push(msg.event);
          eventsRef.current[msg.nodeId] = arr;
          forceRender((x) => x + 1);
          break;
        }
        case "session-status": {
          statusRef.current[msg.nodeId] = msg.status;
          setNodes((cur) =>
            cur.map((nd) =>
              nd.id === msg.nodeId ? { ...nd, data: { ...nd.data, status: msg.status } } : nd,
            ),
          );
          break;
        }
        case "session-meta":
          setSessionMetas(msg.metas);
          break;
        case "session-active-path": {
          // C2 运行轨迹：非空=本轮真实走过这条链路 → 给每条连线计数(每条消息记一次)
          if (msg.edgeIds.length) {
            const now = Date.now();
            setEdgeStats((s) => {
              const next = { ...s };
              for (const eid of msg.edgeIds) next[eid] = { count: (next[eid]?.count ?? 0) + 1, lastTs: now };
              return next;
            });
          }
          // 运行时实际走过的连线：按 runId 存，空=只熄灭这一轮(不波及同会话其它并发群)
          setActivePaths((m) => {
            if (msg.edgeIds.length === 0) {
              if (!m[msg.runId]) return m;
              const next = { ...m };
              delete next[msg.runId];
              return next;
            }
            return { ...m, [msg.runId]: { nodeId: msg.nodeId, edgeIds: msg.edgeIds } };
          });
          break;
        }
        case "log":
          setLogs((l) => [...l.slice(-499), { kind: "log", level: msg.level, text: msg.msg, ts: msg.ts }]);
          break;
        case "inbound":
          setLogs((l) => [
            ...l.slice(-499),
            {
              kind: "inbound",
              text: `${msg.chatId} ← ${msg.sender}(${msg.senderId}): ${msg.text}`,
              ts: msg.ts,
            },
          ]);
          setUnrouted(msg.chatId);
          setInbox((l) => [
            ...l.slice(-999),
            { chatId: msg.chatId, senderId: msg.senderId, sender: msg.sender, text: msg.text, ts: msg.ts },
          ]);
          break;
        case "outbound":
          setLogs((l) => [
            ...l.slice(-499),
            { kind: "outbound", text: `${msg.chatId} → ${msg.text}`, ts: msg.ts },
          ]);
          break;
        case "feishu-status":
          setFeishu({ status: msg.status, detail: msg.detail, bot: msg.bot });
          break;
        case "sessions":
          setSessions(msg.items);
          break;
        case "openid-result":
          setOpenidResult({ items: msg.items, error: msg.error });
          break;
        case "audit-history":
          setInbox(msg.items);
          break;
        case "usage-status":
          setUsage(msg);
          break;
        case "cost-summary":
          setCost(msg);
          break;
        case "soul-path":
          // 人格文件已就绪（必要时刚播种了 starter）→ 用 VSCode 打开让用户编辑，保存即生效
          void invoke("open_path", { path: msg.path, base: "" }).catch(() => {});
          break;
        case "open-file":
          void invoke("open_path", { path: msg.path, base: "" }).catch(() => {});
          break;
        case "knowledge-inbox":
          setKnowledge(msg.items);
          break;
        case "transcript-history":
          // 连接(含重连)时引擎回放近 3 天转录：整包替换（实时事件已被引擎持久化，不会丢/重）
          eventsRef.current = Object.fromEntries(
            Object.entries(msg.histories).map(([k, v]) => [k, [...v]]),
          );
          forceRender((x) => x + 1);
          break;
      }
    });
    return () => {
      off();
      offConn();
      client.dispose();
    };
  }, [client, setNodes, setEdges]);

  // 自动保存：图有实质变化(含布局)就静默存盘。不再依赖手动保存，也不会被任何操作清空。
  useEffect(() => {
    if (!graphInit.current || !configRef.current) return;
    let graph: OblivionisConfig["graph"];
    let sig: string;
    try {
      graph = rfToGraph(nodes, edges);
      sig = JSON.stringify(graph);
    } catch (e) {
      console.error("[autosave] 序列化失败:", e);
      return;
    }
    if (sig === lastSavedSig.current) return; // 仅选中/状态变化等 → 不存
    const t = window.setTimeout(() => {
      lastSavedSig.current = sig;
      client.send({ type: "set-config", config: { ...configRef.current!, graph } });
      flashSaved();
    }, 800);
    return () => window.clearTimeout(t);
  }, [nodes, edges, client]);

  // 撤销/重做历史：图实质变化 settle 后入栈（防抖，避免每帧/纯选中入栈）
  useEffect(() => {
    if (!graphInit.current) return;
    const h = historyRef.current;
    if (h.applying) {
      h.applying = false; // undo/redo 自己的变更，不再入栈
      return;
    }
    const t = window.setTimeout(() => {
      let sig: string;
      try {
        sig = JSON.stringify(rfToGraph(nodes, edges));
      } catch {
        return;
      }
      if (!h.lastSnap) {
        h.lastSnap = { nodes, edges, sig };
        return;
      }
      if (sig === h.lastSnap.sig) return; // 无实质变化(如仅选中)
      h.past.push(h.lastSnap);
      if (h.past.length > 80) h.past.shift();
      h.future = [];
      h.lastSnap = { nodes, edges, sig };
      syncHist();
    }, 450);
    return () => window.clearTimeout(t);
  }, [nodes, edges, syncHist]);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (!h.past.length || !h.lastSnap) return;
    const prev = h.past.pop()!;
    h.future.push(h.lastSnap);
    h.lastSnap = prev;
    h.applying = true;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    syncHist();
  }, [setNodes, setEdges, syncHist]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (!h.future.length || !h.lastSnap) return;
    const next = h.future.pop()!;
    h.past.push(h.lastSnap);
    h.lastSnap = next;
    h.applying = true;
    setNodes(next.nodes);
    setEdges(next.edges);
    syncHist();
  }, [setNodes, setEdges, syncHist]);

  const duplicateNodeById = useCallback(
    (nodeId: string) => {
      const sel = nodes.find((n) => n.id === nodeId);
      if (!sel) return;
      const id = crypto.randomUUID();
      const copy: Node = {
        ...sel,
        id,
        position: { x: sel.position.x + 36, y: sel.position.y + 36 },
        selected: true,
        data: clearedNodeData(sel, true),
      };
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), copy]);
      setSelected(id);
    },
    [nodes, setNodes],
  );

  const duplicateSelected = useCallback(() => {
    const id = nodes.find((n) => n.selected)?.id ?? selected ?? undefined;
    if (id) duplicateNodeById(id);
  }, [nodes, selected, duplicateNodeById]);

  // 多选对齐：按整组的包围盒，把选中节点的对应边/中线对齐
  const alignSelected = useCallback(
    (kind: AlignKind) => {
      setNodes((ns) => {
        // 只对已测量尺寸的选中节点对齐(未测量当 0×0 会把右/中/底对歪)
        const sel = ns.filter((n) => n.selected && n.measured);
        if (sel.length < 2) return ns;
        const w = (n: Node) => n.measured?.width ?? 0;
        const h = (n: Node) => n.measured?.height ?? 0;
        const ids = new Set(sel.map((n) => n.id));
        const minL = Math.min(...sel.map((n) => n.position.x));
        const maxR = Math.max(...sel.map((n) => n.position.x + w(n)));
        const minT = Math.min(...sel.map((n) => n.position.y));
        const maxB = Math.max(...sel.map((n) => n.position.y + h(n)));
        const cx = (minL + maxR) / 2;
        const cy = (minT + maxB) / 2;
        return ns.map((n) => {
          if (!ids.has(n.id)) return n;
          let { x, y } = n.position;
          if (kind === "left") x = minL;
          else if (kind === "right") x = maxR - w(n);
          else if (kind === "hcenter") x = cx - w(n) / 2;
          else if (kind === "top") y = minT;
          else if (kind === "bottom") y = maxB - h(n);
          else if (kind === "vcenter") y = cy - h(n) / 2;
          return { ...n, position: { x, y } };
        });
      });
    },
    [setNodes],
  );

  // 多选等距分布：按中心在首尾之间均匀铺开（需 ≥3）
  const distributeSelected = useCallback(
    (axis: "h" | "v") => {
      setNodes((ns) => {
        const sel = ns.filter((n) => n.selected && n.measured);
        if (sel.length < 3) return ns;
        const size = (n: Node) => (axis === "h" ? (n.measured?.width ?? 0) : (n.measured?.height ?? 0));
        const pos = (n: Node) => (axis === "h" ? n.position.x : n.position.y);
        const center = (n: Node) => pos(n) + size(n) / 2;
        const sorted = [...sel].sort((a, b) => pos(a) - pos(b));
        const first = center(sorted[0]!);
        const last = center(sorted[sorted.length - 1]!);
        const step = (last - first) / (sorted.length - 1);
        const newCenter = new Map<string, number>();
        sorted.forEach((n, i) => newCenter.set(n.id, first + step * i));
        return ns.map((n) => {
          if (!newCenter.has(n.id)) return n;
          const v = newCenter.get(n.id)! - size(n) / 2;
          return { ...n, position: axis === "h" ? { x: v, y: n.position.y } : { x: n.position.x, y: v } };
        });
      });
    },
    [setNodes],
  );

  // 复制/粘贴：内部剪贴板存「选中节点 + 完全内部的连线」，粘贴时换新 id、清身份、递增偏移。
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const pasteCountRef = useRef(0);

  const copySelected = useCallback(
    (explicitId?: string) => {
      let picked = nodes.filter((n) => n.selected);
      if (explicitId) {
        const one = nodes.find((n) => n.id === explicitId);
        picked = one ? [one] : [];
      } else if (picked.length === 0 && selected) {
        const one = nodes.find((n) => n.id === selected);
        if (one) picked = [one];
      }
      if (picked.length === 0) return;
      const set = new Set(picked.map((n) => n.id));
      const inner = edges.filter((e) => set.has(e.source) && set.has(e.target));
      clipboardRef.current = { nodes: picked, edges: inner };
      pasteCountRef.current = 0;
      setHasClipboard(true);
    },
    [nodes, edges, selected],
  );

  const pasteClipboard = useCallback((at?: { x: number; y: number }) => {
    const clip = clipboardRef.current;
    if (!clip || clip.nodes.length === 0) return;
    let dx: number;
    let dy: number;
    if (at) {
      // 粘贴到光标：把整组的左上角对齐到该点，保留组内相对布局
      const minX = Math.min(...clip.nodes.map((n) => n.position.x));
      const minY = Math.min(...clip.nodes.map((n) => n.position.y));
      dx = at.x - minX;
      dy = at.y - minY;
      pasteCountRef.current = 0; // 光标粘贴后，下次普通 Ctrl+V 从一个偏移重新计
    } else {
      pasteCountRef.current += 1;
      dx = dy = 28 * pasteCountRef.current;
    }
    const idMap = new Map<string, string>();
    for (const n of clip.nodes) idMap.set(n.id, crypto.randomUUID());
    const newNodes: Node[] = clip.nodes.map((n) => ({
      ...n,
      id: idMap.get(n.id)!,
      position: { x: n.position.x + dx, y: n.position.y + dy },
      selected: true,
      data: clearedNodeData(n, true),
    }));
    const newEdges: Edge[] = clip.edges.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      selected: false,
    }));
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...newNodes]);
    if (newEdges.length) setEdges((es) => [...es, ...newEdges]);
    setSelected(newNodes.length === 1 ? newNodes[0]!.id : null);
  }, [setNodes, setEdges]);

  // 删除指定节点及其连线（context menu 用）。删除全编辑器统一：不弹确认，靠 Ctrl+Z 撤销兜底
  // （与连线"×"删除一致；自动保存会同步引擎）。
  const deleteNodeById = useCallback(
    (nodeId: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== nodeId));
      setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelected((s) => (s === nodeId ? null : s));
    },
    [setNodes, setEdges],
  );

  // 右键菜单：菜单宽 ~180px，靠近右/下边缘时回拉，避免溢出窗口
  const clampMenu = (x: number, y: number) => ({
    x: Math.min(x, window.innerWidth - 196),
    y: Math.min(y, window.innerHeight - 240),
  });
  const onNodeContextMenu = useCallback((e: ReactMouseEvent, node: Node) => {
    e.preventDefault();
    setSelected(node.id);
    const p = clampMenu(e.clientX, e.clientY);
    setCtxMenu({ x: p.x, y: p.y, kind: "node", id: node.id });
  }, []);
  const onEdgeContextMenu = useCallback((e: ReactMouseEvent, edge: Edge) => {
    e.preventDefault();
    const p = clampMenu(e.clientX, e.clientY);
    setCtxMenu({ x: p.x, y: p.y, kind: "edge", id: edge.id });
  }, []);
  const onPaneContextMenu = useCallback(
    (e: MouseEvent | ReactMouseEvent) => {
      e.preventDefault();
      const me = e as ReactMouseEvent;
      const flow = rf.screenToFlowPosition({ x: me.clientX, y: me.clientY });
      const p = clampMenu(me.clientX, me.clientY);
      setCtxMenu({ x: p.x, y: p.y, kind: "pane", flow });
    },
    [rf],
  );

  // 画布快捷键。焦点在输入框/终端、或命令面板/右键菜单开着时一律不接管
  // (终端的 Ctrl+A/C/D/K/S 要原样交给 claude)。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab === "terminal" || cmdkOpen || ctxMenu) return;
      const ae = document.activeElement as HTMLElement | null;
      if (
        ae &&
        (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable || ae.closest(".terminal-host"))
      )
        return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      // 有文本选区时，把复制/剪切交还给浏览器（日志/转录/审计里选中文字复制），不抢去复制节点
      if (mod && (k === "c" || k === "x") && window.getSelection()?.toString()) return;
      if (!mod) {
        if (k === "f") {
          e.preventDefault();
          rf.fitView({ duration: 300, padding: 0.2 }); // F = 适应视图
        }
        return;
      }
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (k === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (k === "c") {
        e.preventDefault();
        copySelected();
      } else if (k === "v") {
        e.preventDefault();
        pasteClipboard();
      } else if (k === "a") {
        e.preventDefault();
        setNodes((ns) => ns.map((n) => ({ ...n, selected: true })));
      } else if (k === "k") {
        e.preventDefault();
        setCmdkQuery("");
        setCmdkIndex(0);
        setCmdkOpen(true);
      } else if (k === "s") {
        e.preventDefault(); // 已自动保存，这里只是顺手存一次 + 状态栏闪一下
        saveRef.current();
        flashSaved();
      } else if (k === "0") {
        e.preventDefault();
        rf.zoomTo(1, { duration: 150 });
      } else if (k === "=" || k === "+") {
        e.preventDefault();
        rf.zoomIn({ duration: 150 });
      } else if (k === "-") {
        e.preventDefault();
        rf.zoomOut({ duration: 150 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, duplicateSelected, copySelected, pasteClipboard, setNodes, tab, cmdkOpen, ctxMenu, rf, flashSaved]);

  // 自定义 onNodesChange：单节点拖动时算对齐参考线并吸附；其它变更原样应用。
  // 纯函数写法：不在 setNodes 更新器里改 state、不改入参 change（StrictMode 双调用安全）。
  const nodesRef = useRef<Node[]>([]);
  nodesRef.current = nodes;
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // 只在"单个节点正被拖动"时吸附(其余 position/dimensions/select 变更可与之同批)
      const dragging = changes.filter(
        (c): c is Extract<NodeChange, { type: "position" }> => c.type === "position" && !!c.dragging,
      );
      const ch = dragging.length === 1 ? dragging[0] : undefined;
      if (ch && ch.position) {
        const lines = getHelperLines(ch, nodesRef.current);
        const snapped = { ...ch, position: { x: lines.snapPosition.x ?? ch.position.x, y: lines.snapPosition.y ?? ch.position.y } };
        setHelperLines({ horizontal: lines.horizontal, vertical: lines.vertical });
        setNodes((ns) => applyNodeChanges(changes.map((c) => (c === ch ? snapped : c)), ns));
      } else {
        setHelperLines((h) => (h.horizontal === undefined && h.vertical === undefined ? h : {}));
        setNodes((ns) => applyNodeChanges(changes, ns));
      }
    },
    [setNodes],
  );

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, id: crypto.randomUUID() }, eds)),
    [setEdges],
  );

  const onNodeClick: NodeMouseHandler = useCallback((e, node) => {
    // Shift/Ctrl 点击是多选手势：不打开单节点检视，交给对齐工具条
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    setSelected(node.id);
    setSelectedEdge(null);
    setInspectorOpen(true);
  }, []);

  const onEdgeClick = useCallback((_: unknown, edge: Edge) => {
    setSelectedEdge(edge.id);
    setSelected(null);
    setInspectorOpen(true);
  }, []);

  // 点画布空白处：收起所有浮窗（节点编辑/连线/飞书）
  const onPaneClick = useCallback(() => {
    setSelected(null);
    setSelectedEdge(null);
    setInspectorOpen(false);
    setFeishuOpen(false);
  }, []);

  // Esc 关闭浮窗（商业软件惯例）。不抢输入框/终端里的 Esc：终端有自己的 handler，
  // 这里只在事件冒泡到 document 且确有浮窗开着时处理。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.closest(".xterm"))) return;
      setFeishuOpen(false);
      setInspectorOpen(false);
      setSelectedEdge(null);
      setCtxMenu(null);
      setDropMenu(null);
      setCmdkOpen(false);
      setSettingsOpen(false);
      setAddMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // 任务栏进度流光：只看「自己的终端会话」是否在跑，且持续工作超过一段时间(长任务)才亮，
  // 避免每条短命令都闪。空闲即清。常驻能力，不受「完成提示」开关控制。
  // 启动时探一遍关键窗口能力：哪个不可用(能力标识符不对/缺权限)就在控制台明确报出来，
  // 别让小人/流光/定位这些 .catch 吞掉的调用静默失效——以前完全看不出是没生效还是没触发。
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    void (async () => {
      const w = getCurrentWindow();
      const probe = async (name: string, fn: () => Promise<unknown>) => {
        try {
          await fn();
          console.info(`[cap] ✓ ${name}`);
        } catch (e) {
          console.warn(`[cap] ✗ ${name} —— ${(e as Error)?.message ?? e}（能力可能缺失/标识符不对，需重新部署 rebuild-deploy）`);
        }
      };
      await probe("window:set-progress-bar", () => w.setProgressBar({ status: ProgressBarStatus.None }));
      await probe("window:current-monitor", () => currentMonitor());
      await probe("window:is-focused", () => w.isFocused());
      await probe("window:is-minimized", () => w.isMinimized());
      await probe("mascot 窗口存在", async () => {
        const m = await WebviewWindow.getByLabel("mascot");
        if (!m) throw new Error("找不到 mascot 窗口(tauri.conf 未生效?)");
      });
    })();
  }, []);

  // 启动闪屏：固定 4 秒(进度条走满)后显示主窗、关掉闪屏小窗。引擎慢/没起来也照常弹主窗(不会卡住)。
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let done = false;
    const reveal = async () => {
      if (done) return;
      done = true;
      try {
        const main = getCurrentWindow();
        await main.show();
        await main.setFocus();
      } catch (e) {
        console.warn(`[splash] 显示主窗失败: ${(e as Error)?.message ?? e}`);
      }
      try {
        const sp = await WebviewWindow.getByLabel("splashscreen");
        await sp?.close();
      } catch (e) {
        console.warn(`[splash] 关闭闪屏失败: ${(e as Error)?.message ?? e}`);
      }
    };
    const t = window.setTimeout(reveal, 4000);
    return () => window.clearTimeout(t);
  }, []);

  const anyTermRunning = useMemo(() => Object.values(termRunning).some(Boolean), [termRunning]);
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return; // 浏览器开发版没有窗口 API
    const win = getCurrentWindow();
    const fail = (e: unknown) => console.warn(`[cap] setProgressBar 失败: ${(e as Error)?.message ?? e}`);
    if (!anyTermRunning) {
      win.setProgressBar({ status: ProgressBarStatus.None }).catch(fail);
      return;
    }
    // 终端持续工作满 12 秒才点亮流光(=判定为长任务)
    const t = window.setTimeout(() => {
      win.setProgressBar({ status: ProgressBarStatus.Indeterminate }).catch(fail);
    }, 12_000);
    return () => window.clearTimeout(t);
  }, [anyTermRunning]);

  // 主题：解析 system → 实际明暗，写 data-theme（CSS 变量切换），持久化；system 时跟随系统变化
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const r = theme === "light" || (theme === "system" && mq.matches) ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", r);
      setResolvedTheme(r);
    };
    apply();
    localStorage.setItem("oblivionis-theme", theme);
    if (theme === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  // 用户在设置里主动切主题：更新 App 主题 + 顺手把 Claude 终端主题写进 ~/.claude/settings.json。
  // 只在"主动切换"时同步(不在每次启动/系统变化时写)，避免覆盖用户在别处设的 Claude 主题。
  const applyTheme = (v: ThemePref) => {
    setTheme(v);
    const resolved =
      v === "light" || (v === "system" && window.matchMedia("(prefers-color-scheme: light)").matches)
        ? "light"
        : "dark";
    client.send({ type: "set-claude-theme", theme: resolved });
    setThemeNotice(true);
  };

  // 点浮窗外部 → 关闭浮窗（设置/飞书/节点·连线编辑）。点浮窗内、或点该浮窗自己的触发器
  // (data-popup)不关——触发器自身的 onClick 负责 toggle；点别的浮窗触发器则照常关本浮窗。
  useEffect(() => {
    if (!feishuOpen && !settingsOpen && !inspectorOpen && !addMenuOpen && !costOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.closest(".popup")) return; // 点在某浮窗内部
      const trig = t.closest("[data-popup]")?.getAttribute("data-popup");
      if (trig !== "settings") setSettingsOpen(false);
      if (trig !== "feishu") setFeishuOpen(false);
      if (trig !== "cost") setCostOpen(false);
      // 添加节点下拉：点按钮自身(data-popup=addmenu)或菜单内部不关，点别处才关
      if (trig !== "addmenu" && !t.closest(".add-menu")) setAddMenuOpen(false);
      // 节点检视：点节点不关(让 onNodeClick 切换/拖动保持)，点真正的外部(空白/面板/侧栏)才关
      if (!t.closest(".react-flow__node")) setInspectorOpen(false);
    };
    // 用捕获阶段：React Flow 会吞掉画布上的 mousedown 冒泡，捕获能先收到，保证点画布也能关
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [feishuOpen, settingsOpen, inspectorOpen, addMenuOpen, costOpen]);

  // 切到某会话(显示其终端)时：记录"在看谁"，并清掉它的完成红点
  useEffect(() => {
    activeTermRef.current = activeTerminal;
    if (activeTerminal) setUnseenDone((m) => (m[activeTerminal] ? { ...m, [activeTerminal]: false } : m));
  }, [activeTerminal]);

  // 打开(保活)某会话节点的终端并切到终端标签（画布双击 / 折叠菜单双击共用）
  const openTerminalForNode = useCallback((nodeId: string) => {
    if (!termIds.current.has(nodeId)) termIds.current.set(nodeId, crypto.randomUUID());
    setSelected(nodeId);
    setActiveTerminal(nodeId);
    setOpenedTerminals((o) => (o.includes(nodeId) ? o : [...o, nodeId]));
    setTab("terminal");
    setLastSessionView("terminal"); // 打开终端=选了"终端"这种会话视图 → 之后切会话沿用它(粘滞)
    setCanvasCollapsed(true); // 打开终端 → 退出节点视图，终端占满
  }, []);

  // 在节点视图里定位某节点：确保画布展开 → 选中 → 平滑居中。供会话侧栏点击 / Ctrl+K 搜索复用。
  const locateNode = useCallback(
    (nodeId: string) => {
      setCanvasCollapsed(false);
      setSelected(nodeId);
      setNodes((ns) => ns.map((nd) => ({ ...nd, selected: nd.id === nodeId })));
      const n = nodes.find((x) => x.id === nodeId);
      if (n) {
        const w = n.measured?.width ?? 180;
        const h = n.measured?.height ?? 90;
        rf.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: 1, duration: 400 });
      }
    },
    [nodes, setNodes, rf],
  );

  // 一键重开所有终端(卸载→重挂)：claude 以 --resume 重启，按新主题整屏重渲染(含 diff/语法色)，
  // 会话/历史靠 resume 保留。用于切主题后让已开终端里 Claude 的配色也跟着变。
  const reopenAllTerminals = () => {
    const ids = openedTerminals;
    if (ids.length === 0) return;
    setOpenedTerminals([]); // 先全卸载(关 PTY/杀 claude)
    window.setTimeout(() => {
      setOpenedTerminals(ids); // 再重挂(新 claude --resume，用新主题)
      setCanvasCollapsed(true);
    }, 80);
  };

  // 双击「Claude 会话」节点：打开它的开发终端
  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.type !== "claude-session") return;
      openTerminalForNode(node.id);
    },
    [openTerminalForNode],
  );

  // 「完成时提醒」：把独立的小人窗口移到主屏任务栏上方居中，显示并发事件让它播放弹出动画。
  // 任务栏精确按钮位置 Windows 无稳定 API，按用户建议用"主屏底部居中"的稳定方案。
  const showMascot = useCallback(async (nodeId: string, label: string) => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    try {
      const w = await WebviewWindow.getByLabel("mascot");
      if (!w) return;
      const MW = 200; // mascot 窗口宽高(逻辑px)
      const margin = 12;
      const mon = await currentMonitor();
      if (mon) {
        const sf = mon.scaleFactor || 1;
        const leftL = mon.position.x / sf;
        const topL = mon.position.y / sf;
        const widthL = mon.size.width / sf;
        const heightL = mon.size.height / sf;
        // 固定右下角，仿 Windows 通知：贴右、落在任务栏(约48)上缘
        const x = leftL + widthL - MW - margin;
        const y = topL + heightL - 48 - MW;
        await w.setPosition(new LogicalPosition(x, y));
      }
      await w.show();
      await tauriEmit("mascot-show", { nodeId, label, durationMs: mascotSec * 1000 });
    } catch (e) {
      console.warn(`[cap] 小人弹窗失败: ${(e as Error)?.message ?? e}（窗口/能力问题，需重新部署）`);
    }
  }, [mascotSec]);

  // 点小人 → 主窗口聚焦并跳到那个完成的会话
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let un: (() => void) | undefined;
    tauriListen<{ nodeId?: string }>("mascot-clicked", async (e) => {
      try {
        const w = getCurrentWindow();
        if (await w.isMinimized()) await w.unminimize();
        await w.show();
        await w.setFocus();
      } catch (err) {
        console.warn(`[cap] 点小人后聚焦主窗口失败: ${(err as Error)?.message ?? err}`);
      }
      const nid = e.payload?.nodeId;
      if (nid) {
        openTerminalForNode(nid);
        setUnseenDone((u) => (u[nid] ? { ...u, [nid]: false } : u));
      }
    }).then((f) => (un = f));
    return () => un?.();
  }, [openTerminalForNode]);

  /** 设置某条连线的条件(意图描述) */
  const setEdgeCondition = (edgeId: string, condition: string) => {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId ? { ...e, data: { ...e.data, condition: condition || undefined } } : e,
      ),
    );
  };

  // 画布配置导出：整张图(节点+连线+位置)存成 JSON 下载；抹掉机器相关/敏感字段
  // (会话身份 sessionId/baseSessionId 导入后会自动重 fork；webhook token 不外泄)。
  const importInputRef = useRef<HTMLInputElement>(null);
  const exportCanvas = () => {
    const g = rfToGraph(nodes, edges);
    const safeNodes = g.nodes.map((n) => {
      const d = { ...(n.data as Record<string, unknown>) };
      if (n.kind === "claude-session") {
        delete d.sessionId;
        delete d.baseSessionId;
      }
      if (n.kind === "webhook") delete d.token;
      return { ...n, data: d };
    });
    const payload = {
      app: "OblivionisAgent",
      kind: "canvas",
      version: 1,
      exportedAt: new Date().toISOString(),
      graph: { nodes: safeNodes, edges: g.edges },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oblivionis-canvas-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importCanvas = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        const g = obj?.graph ?? obj; // 容忍带壳或直接是 graph
        if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) {
          throw new Error("不是有效的画布配置(缺 graph.nodes/edges)");
        }
        if (!window.confirm(`导入将替换当前画布（${g.nodes.length} 个节点、${g.edges.length} 条连线），确定？`)) {
          return;
        }
        const { nodes: rn, edges: re } = graphToRf({ graph: g } as unknown as OblivionisConfig, {});
        setSelected(null);
        setSelectedEdge(null);
        setNodes(rn);
        setEdges(re); // 变更会触发既有的防抖自动存盘
        window.setTimeout(() => rf.fitView({ duration: 300, padding: 0.2 }), 60);
      } catch (e) {
        window.alert(tStatic("导入失败：{0}", (e as Error).message));
      }
    };
    reader.readAsText(file);
  };

  // 面板宽度跟随窗口收缩：换小屏/缩窗口/跨不同 DPI 屏幕时，把侧栏夹进当前可用宽度，
  // 避免它越出外框(=外框/内部不匹配)、也让终端跟着窗口变窄。留 ~364px 给图标栏+会话栏+最小画布。
  const maxPanelWidth = () => Math.max(280, window.innerWidth - 364);
  useEffect(() => {
    const clamp = () => setPanelWidth((w) => Math.min(w, maxPanelWidth()));
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  // 拖动右侧分隔条调整面板宽度（让终端可拉宽）
  const startResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: globalThis.MouseEvent) =>
      setPanelWidth(Math.min(maxPanelWidth(), Math.max(280, startW + (startX - ev.clientX))));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const addNode = (kind: keyof typeof NEW_NODE_DEFAULTS, pos?: { x: number; y: number }) => {
    const base = NEW_NODE_DEFAULTS[kind]!();
    const id = crypto.randomUUID();
    const node: Node = {
      id,
      type: kind,
      position: pos ?? { x: 80 + Math.round(60 * (nodes.length % 5)), y: 80 + 40 * nodes.length },
      data: { ...base.data, label: t(base.label), status: "idle" },
    };
    setNodes((n) => [...n, node]);
    setSelected(id);
  };

  // 建一个新节点并立刻把 sourceId 连过来（拖线到空白处落地用）。targetHandle 给人格口等特殊入口。
  const addNodeConnected = (
    kind: keyof typeof NEW_NODE_DEFAULTS,
    pos: { x: number; y: number },
    sourceId: string,
    targetHandle?: string,
  ) => {
    const baseDef = NEW_NODE_DEFAULTS[kind]!();
    const id = crypto.randomUUID();
    setNodes((n) => [
      ...n,
      { id, type: kind, position: pos, data: { ...baseDef.data, label: t(baseDef.label), status: "idle" } },
    ]);
    setEdges((es) =>
      addEdge(
        { id: crypto.randomUUID(), source: sourceId, sourceHandle: null, target: id, targetHandle: targetHandle ?? null },
        es,
      ),
    );
    setSelected(id);
  };

  // 拖线松手：落在合法端口 React Flow 已自动连上；落在空白且来自输出口 → 弹「可连类型」菜单
  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, state) => {
      if (state.isValid) return;
      const fh = state.fromHandle;
      if (!fh || fh.type !== "source" || !fh.nodeId) return;
      const srcKind = nodes.find((n) => n.id === fh.nodeId)?.type;
      const opts = dropTargetsFor(srcKind);
      if (opts.length === 0) return;
      const me = event as MouseEvent;
      const sx = me.clientX ?? 0;
      const sy = me.clientY ?? 0;
      const flowPos = rf.screenToFlowPosition({ x: sx, y: sy });
      setDropMenu({ sx, sy, flowPos, srcId: fh.nodeId, opts });
    },
    [nodes, rf],
  );

  const save = () => {
    if (!config) return;
    const graph = rfToGraph(nodes, edges);
    lastSavedSig.current = JSON.stringify(graph);
    client.send({ type: "set-config", config: { ...config, graph } });
  };
  saveRef.current = save;

  /** 更新主人列表（全局配置），立即存盘 */
  const setOwners = (owners: Owner[]) => {
    if (!config) return;
    const graph = rfToGraph(nodes, edges);
    const next = { ...config, owners, graph };
    setConfig(next);
    configRef.current = next;
    lastSavedSig.current = JSON.stringify(graph);
    client.send({ type: "set-config", config: next });
  };

  /** 设置 Home Chat（运维群），立即存盘 */
  const setHomeChat = (chatId: string) => {
    if (!config) return;
    const graph = rfToGraph(nodes, edges);
    const next = { ...config, homeChatId: chatId, graph };
    setConfig(next);
    configRef.current = next;
    lastSavedSig.current = JSON.stringify(graph);
    client.send({ type: "set-config", config: next });
  };

  /** 用某个 chatId 一键新建飞书群节点（联调/onboarding 用） */
  const addGroupForChat = (chatId: string) => {
    const id = crypto.randomUUID();
    setNodes((n) => [
      ...n,
      {
        id,
        type: "feishu-group",
        position: { x: 60, y: 60 + 40 * n.length },
        data: { chatId, triggerMode: "mention", label: `群 ${chatId.slice(0, 10)}`, status: "idle" },
      },
    ]);
    setSelected(id);
    setUnrouted(null);
  };

  // 收到入站消息、但还没有匹配的群节点时，提示一键创建
  const unroutedActive =
    unrouted && !nodes.some((n) => n.type === "feishu-group" && (n.data as any).chatId === unrouted)
      ? unrouted
      : null;

  const patchSelected = (patch: Record<string, unknown>) => {
    if (!selected) return;
    setNodes((cur) =>
      cur.map((nd) => (nd.id === selected ? { ...nd, data: { ...nd.data, ...patch } } : nd)),
    );
  };

  /** 删除选中的节点及其连线（不弹确认，靠 Ctrl+Z 撤销；自动保存会同步引擎） */
  const deleteSelected = () => {
    if (!selected) return;
    setNodes((ns) => ns.filter((n) => n.id !== selected));
    setEdges((es) => es.filter((e) => e.source !== selected && e.target !== selected));
    setSelected(null);
  };

  const selectedNode = nodes.find((n) => n.id === selected) ?? null;
  const selectedIsClaude = selectedNode?.type === "claude-session";
  const multiSelectCount = nodes.reduce((a, n) => a + (n.selected ? 1 : 0), 0);

  // 运行时高亮：每个 running 会话——若引擎报来了"本轮真实链路"(activePaths)就只点亮那条，
  // 避免汇聚会话两条入边都亮；否则(cron/webhook 等无路由)回退为沿入边回溯整条上游链路。
  const activeEdgeIds = useMemo(() => {
    const active = new Set<string>();
    const runningIds = nodes
      .filter((n) => (n.data as { status?: string } | undefined)?.status === "running")
      .map((n) => n.id);
    if (runningIds.length === 0) return active;
    const incoming = new Map<string, Edge[]>();
    for (const e of edges) {
      const arr = incoming.get(e.target);
      if (arr) arr.push(e);
      else incoming.set(e.target, [e]);
    }
    for (const rid of runningIds) {
      // 收集所有"正流向该会话"的真实链路(多个群可并发触发同一会话 → 多条同时点亮)
      const reported = Object.values(activePaths).filter((p) => p.nodeId === rid);
      if (reported.length) {
        for (const p of reported) for (const eid of p.edgeIds) active.add(eid); // 真实链路：只点这些
        continue;
      }
      // 回退：从该 running 节点沿入边回溯整条上游链路
      const visited = new Set<string>([rid]);
      const frontier = [rid];
      while (frontier.length) {
        const cur = frontier.pop()!;
        for (const e of incoming.get(cur) ?? []) {
          active.add(e.id);
          if (!visited.has(e.source)) {
            visited.add(e.source);
            frontier.push(e.source);
          }
        }
      }
    }
    return active;
  }, [nodes, edges, activePaths]);

  // 聚焦高亮：选中单个节点时，它上下游链路上的连线集合（其它连线降透明度）。无选中=null。
  const focusEdgeIds = useMemo(() => {
    if (!selected || multiSelectCount > 1) return null;
    const out = new Map<string, Edge[]>();
    const inc = new Map<string, Edge[]>();
    for (const e of edges) {
      (out.get(e.source) ?? (out.set(e.source, []), out.get(e.source)!)).push(e);
      (inc.get(e.target) ?? (inc.set(e.target, []), inc.get(e.target)!)).push(e);
    }
    const set = new Set<string>();
    const walk = (start: string, adj: Map<string, Edge[]>, next: (e: Edge) => string) => {
      const seen = new Set([start]);
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const e of adj.get(cur) ?? []) {
          set.add(e.id);
          const nx = next(e);
          if (!seen.has(nx)) {
            seen.add(nx);
            stack.push(nx);
          }
        }
      }
    };
    walk(selected, out, (e) => e.target); // 下游
    walk(selected, inc, (e) => e.source); // 上游
    return set.size ? set : null; // 选中孤立节点(无连线)不做聚焦，免得把所有线都压暗
  }, [selected, multiSelectCount, edges]);

  // 折叠菜单用：画布上所有 Claude 会话节点（单击选择看转录·访客会话 / 双击打开开发终端）
  const claudeNodes = nodes.filter((n) => n.type === "claude-session");

  // 保活终端：每个已打开的会话节点一个 TermInfo（cwd/sid 在首次打开时定型）
  const termInfos: TermInfo[] = openedTerminals
    .map((id) => {
      const n = nodes.find((x) => x.id === id);
      if (!n || n.type !== "claude-session") return null;
      const d = n.data as Record<string, any>;
      return {
        nodeId: id,
        label: (d.label as string) || "会话",
        cwd: (d.cwd as string) || config?.claude.defaultCwd || "",
        bin: config?.claude.binPath ?? "claude",
        // 终端=「我 Fork 前的开发会话」：优先 --resume 节点填的 baseSessionId（开发会话，有历史），
        // 其次运行中的 sessionId；都没有(全新节点)才用一个稳定随机 id 新建。这样双击直接看到历史。
        sid:
          (d.baseSessionId as string) ||
          (d.sessionId as string) ||
          termIds.current.get(id) ||
          "",
      } as TermInfo;
    })
    .filter((x): x is TermInfo => x !== null);
  const activeTerminalId =
    activeTerminal && openedTerminals.includes(activeTerminal)
      ? activeTerminal
      : openedTerminals[openedTerminals.length - 1] ?? null;
  // 当前终端会话的上下文体量估算（读其 transcript 最后一回合 usage，不耗 token）。
  // 用 ref 取当前 activeTerminalId/nodes，避免 nodes 频繁变动导致 fetchCtx 重建/狂刷。
  const ctxDepsRef = useRef({ activeTerminalId, nodes });
  ctxDepsRef.current = { activeTerminalId, nodes };
  const ctxMtimeRef = useRef<number | null>(null); // 上次拿到的 transcript 修改时间(ms)，传给后端做"没变就别读"判断
  const fetchCtx = useCallback(() => {
    const { activeTerminalId: aid, nodes: ns } = ctxDepsRef.current;
    const n = aid ? ns.find((x) => x.id === aid) : null;
    const d = n?.data as { cwd?: string; baseSessionId?: string; sessionId?: string } | undefined;
    const sid = d?.baseSessionId || d?.sessionId || "";
    if (!sid) {
      setCtx(null);
      ctxMtimeRef.current = null;
      return;
    }
    void invoke<{
      unchanged?: boolean;
      ctxTokens?: number;
      outTokens?: number;
      model?: string;
      baseTokens?: number;
      mtime?: number;
    }>("context_estimate", { cwd: d?.cwd ?? "", sessionId: sid, sinceMtime: ctxMtimeRef.current })
      .then((r) => {
        if (!r || r.unchanged) return; // 文件没变 → 后端连读都没读，保持现状
        ctxMtimeRef.current = r.mtime ?? null;
        setCtx(
          r.ctxTokens && r.ctxTokens > 0
            ? {
                ctxTokens: r.ctxTokens,
                outTokens: r.outTokens ?? 0,
                model: r.model ?? "",
                baseTokens: r.baseTokens ?? 0,
              }
            : null,
        );
      })
      .catch(() => setCtx(null));
  }, []);
  useEffect(() => {
    ctxMtimeRef.current = null; // 换终端 → 强制重读一次
    fetchCtx();
    // 轮询很慢(3 分钟)：常驻小 % 只需"扫一眼大致对"，要精确就悬停即时重读。
    // 每次也只问一次"文件变了吗"(后端一次 stat、几微秒)，变了才读 transcript；空闲几乎零开销。
    const id = setInterval(fetchCtx, 180000);
    return () => clearInterval(id);
  }, [activeTerminalId, fetchCtx]);

  // 顶部「周活跃」+「状态」小标：读 ~/.claude 的本地缓存/配置，不耗 token。
  const [glanceStats, setGlanceStats] = useState<StatsData | null>(null);
  const [glanceStatus, setGlanceStatus] = useState<StatusData | null>(null);
  const fetchGlance = useCallback(() => {
    void invoke<StatsData>("claude_stats")
      .then((s) => setGlanceStats(s && s.dailyActivity?.length ? s : null))
      .catch(() => {});
    void invoke<StatusData>("claude_status")
      .then((s) => setGlanceStatus(s && (s.version || s.name) ? s : null))
      .catch(() => {});
  }, []);
  useEffect(() => {
    fetchGlance();
    // 很慢(5 分钟)：两个小本地文件(19KB+52KB)、版本号已缓存。悬停时还会即时重读。
    const id = setInterval(fetchGlance, 300000);
    return () => clearInterval(id);
  }, [fetchGlance]);

  const selectedEdgeObj = edges.find((e) => e.id === selectedEdge) ?? null;
  const edgeEndLabel = (id: string) =>
    ((nodes.find((n) => n.id === id)?.data as { label?: string } | undefined)?.label as string) ?? id.slice(0, 6);

  const sendTest = () => {
    if (selected && selectedIsClaude && testText.trim()) {
      save(); // 先把最新节点同步给 Bridge（WS 有序：set-config 会先于 send-to-session 处理）
      client.send({ type: "send-to-session", nodeId: selected, text: testText.trim() });
      setTestText("");
      setTab("transcript");
    }
  };

  /** 左侧图标竖栏动作分发：节点图与面板视图互斥切换 */
  const onRailAction = (key: RailKey) => {
    switch (key) {
      case "canvas": {
        const opening = canvasCollapsed; // 当前折叠 → 这次是「进节点视图」
        setCanvasCollapsed(!canvasCollapsed); // 切换:节点视图 ⇄ 终端/面板视图
        if (opening) {
          // 进节点视图时别带着终端那个选中——否则会触发链路聚焦把其它连线压成半透明
          setSelected(null);
          setNodes((ns) => (ns.some((n) => n.selected) ? ns.map((n) => (n.selected ? { ...n, selected: false } : n)) : ns));
        }
        break;
      }
      case "feishu":
        setFeishuOpen((o) => !o);
        break;
      case "settings":
        setSettingsOpen((o) => !o);
        break;
      case "mdviewer":
        void invoke("open_md_viewer"); // 文档查看器是独立窗口，可边看边继续用主窗
        break;
      case "cost":
        setCostOpen((o) => !o); // 成本看板浮层：盖在主界面上，点外部自动关（不占面板/不和选会话冲突）
        break;
      default:
        setTab(key);
        setCanvasCollapsed(true); // 切到终端/转录/审计/日志/收件箱面板 → 退出节点视图
    }
  };

  // 面板标题：转录/终端跟随当前会话名，让"左侧选了谁→右侧看的是谁"一目了然
  const selectedLabel =
    (selectedNode?.data as { label?: string } | undefined)?.label ?? null;
  const activeTermLabel = activeTerminalId
    ? ((nodes.find((n) => n.id === activeTerminalId)?.data as { label?: string })?.label ?? null)
    : null;
  // Ctrl+K 命令面板的命令清单（添加节点定位到画布中心；外加视图/撤销/重做）
  const cmdkCenter = () => {
    const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
    if (!rect) return undefined;
    return rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };
  const selIds = () => new Set(nodes.filter((n) => n.selected).map((n) => n.id));
  const cmdkCommands: { id: string; label: string; hint?: string; run: () => void }[] = [
    ...PALETTE.map(([kind, label]) => ({
      id: `add-${kind}`,
      label: t("添加节点：{0}", t(label)),
      hint: t("节点"),
      run: () => addNode(kind, cmdkCenter()),
    })),
    { id: "selall", label: t("全选节点"), hint: "Ctrl+A", run: () => setNodes((ns) => ns.map((n) => ({ ...n, selected: true }))) },
    { id: "copy", label: t("复制选中（放入剪贴板）"), hint: "Ctrl+C", run: () => copySelected() },
    ...(hasClipboard ? [{ id: "paste", label: t("粘贴"), hint: "Ctrl+V", run: () => pasteClipboard() }] : []),
    {
      id: "del",
      label: t("删除选中（可撤销）"),
      hint: "Delete",
      run: () => {
        const ids = selIds();
        if (!ids.size) return;
        setNodes((ns) => ns.filter((n) => !ids.has(n.id)));
        setEdges((es) => es.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
      },
    },
    { id: "fit", label: t("适应视图（看全画布）"), hint: t("视图"), run: () => rf.fitView({ duration: 300, padding: 0.2 }) },
    { id: "undo", label: t("撤销"), hint: "Ctrl+Z", run: undo },
    { id: "redo", label: t("重做"), hint: "Ctrl+Shift+Z", run: redo },
    // 每个节点一条「定位」命令：输入名字即可搜索并平滑跳到它，会话/节点多时找位置很方便
    ...nodes.map((n) => {
      const dl = (n.data as { label?: string } | undefined)?.label;
      const kindLabel = t(PALETTE.find(([k]) => k === n.type)?.[1] ?? n.type ?? "节点");
      return {
        id: `loc-${n.id}`,
        label: t("定位节点：{0}", dl ? `${dl}（${kindLabel}）` : kindLabel),
        hint: t("搜索"),
        run: () => locateNode(n.id),
      };
    }),
  ];
  const cmdkQ = cmdkQuery.trim().toLowerCase();
  const cmdkFiltered = cmdkQ ? cmdkCommands.filter((c) => c.label.toLowerCase().includes(cmdkQ)) : cmdkCommands;

  const pendingKnowledge = knowledge.filter((k) => k.status === "pending").length;
  const TAB_TITLE: Record<Tab, string> = {
    transcript:
      selectedIsClaude && selectedLabel
        ? t("转录 · {0} 的访客会话", selectedLabel)
        : t("转录 · 访客会话（左侧选择一个会话）"),
    terminal: activeTermLabel ? t("终端 · {0}", activeTermLabel) : t("终端 · 开发会话"),
    audit: t("审计 · 谁问了什么"),
    logs: t("服务日志"),
    inbox: t("知识收件箱") + (pendingKnowledge ? t(" · {0} 条待裁决", pendingKnowledge) : ""),
  };
  // 标题旁的一句功能说明（让"这个界面是干嘛的"一目了然）
  const TAB_DESC: Partial<Record<Tab, string>> = {
    audit: t("谁(主人/访客)问了什么、命中哪个会话——只读留痕，不可改"),
    inbox: t("群聊里沉淀出的规则 / 人格修订候选，等你采纳或忽略"),
    logs: t("引擎 / 服务运行日志，排障时看"),
  };
  // 终端⇄转录是"同一个会话的两种视图"：粘滞切换，保持当前在看的会话
  const viewedSessionId = tab === "terminal" ? activeTerminalId : selectedIsClaude ? selected : null;
  const showTerminalView = () => {
    setLastSessionView("terminal");
    if (viewedSessionId) openTerminalForNode(viewedSessionId);
    else setTab("terminal");
  };
  const showTranscriptView = () => {
    setLastSessionView("transcript");
    if (viewedSessionId) setSelected(viewedSessionId);
    setTab("transcript");
  };

  return (
    <div className="app">
      <header className="toolbar" data-tauri-drag-region>
        <strong className="brand" data-tauri-drag-region>
          Oblivionis<span className="brand-accent">Agent</span>
        </strong>
        <button
          className={`fs-chip ${feishuOpen ? "on" : ""}`}
          data-popup="feishu"
          onClick={() => setFeishuOpen((o) => !o)}
          title={t("飞书连接（点开/收起设置）")}
        >
          <FeishuStatusDot status={feishu.status} />
          {t("飞书")}{feishu.bot?.name ? `：${feishu.bot.name}` : ""}
        </button>
        {selectedNode && !inspectorOpen && (
          <button onClick={() => setInspectorOpen(true)} title={t("编辑选中节点（画布收起时也可用）")}>
            {t("✎ 编辑节点")}
          </button>
        )}
        <div className="spacer" data-tauri-drag-region />
        {glanceStats && <StatsChip stats={glanceStats} onHover={fetchGlance} />}
        {glanceStatus && <StatusChip status={glanceStatus} onHover={fetchGlance} />}
        {usage?.sessionPct != null && (
          <span
            className={`usage-chip ${usage.sessionPct >= 85 ? "hot" : usage.sessionPct >= 60 ? "warm" : ""}`}
            title={
              `${t("Claude 订阅用量")}\n${t("5小时窗口: {0}%", usage.sessionPct)}${usage.sessionResets ? t(" · {0}重置", usage.sessionResets) : ""}` +
              (usage.weekPct != null
                ? `\n${t("本周(全模型): {0}%", usage.weekPct)}${usage.weekResets ? t(" · {0}重置", usage.weekResets) : ""}`
                : "") +
              `\n${t("每 5 分钟自动刷新")}`
            }
          >
            <span className="usage-bar">
              <span style={{ width: `${Math.min(100, usage.sessionPct)}%` }} />
            </span>
            5h {Math.round(usage.sessionPct)}%
            {usage.weekPct != null && <span className="usage-week">{t("周 {0}%", Math.round(usage.weekPct))}</span>}
          </span>
        )}
        <WindowControls />
      </header>

      {unroutedActive && (
        <div className="banner">
          {t("收到来自")} <code>{unroutedActive}</code> {t("的消息，但没有匹配的群节点。")}
          <button onClick={() => addGroupForChat(unroutedActive)}>{t("用该 chatId 新建群节点")}</button>
          <button className="ghost" onClick={() => setUnrouted(null)}>
            {t("忽略")}
          </button>
        </div>
      )}

      <div className="shell">
        <IconRail
          canvasOpen={!canvasCollapsed}
          tab={tab}
          settingsOpen={settingsOpen}
          costOpen={costOpen}
          inboxBadge={pendingKnowledge}
          onAction={onRailAction}
        />
        <SessionSidebar
          claudeNodes={claudeNodes}
          selected={selected}
          activeTerminalId={activeTerminalId}
          openedTerminals={openedTerminals}
          termRunning={termRunning}
          unseenDone={unseenDone}
          onReorder={(dragId, dropId, after) =>
            setNodes((ns) => {
              const from = ns.findIndex((n) => n.id === dragId);
              if (from < 0) return ns;
              const arr = [...ns];
              const [moved] = arr.splice(from, 1);
              if (!moved) return ns;
              const to = arr.findIndex((n) => n.id === dropId);
              if (to < 0) return ns;
              arr.splice(after ? to + 1 : to, 0, moved); // 落点之前/之后；变更触发既有自动存盘
              return arr;
            })
          }
          onOpenTerminal={(id) => {
            if (!canvasCollapsed) {
              // 节点视图下点会话 → 定位到该节点(选中+居中)，会话多时方便找位置，不切去终端
              locateNode(id);
              return;
            }
            // 面板视图：选中该会话，按"上次的会话视图"显示(粘滞)，不再强制跳终端
            setSelected(id);
            if (lastSessionView === "transcript") {
              setTab("transcript");
            } else {
              openTerminalForNode(id); // 终端视图：打开/聚焦它的终端
            }
          }}
          onAddSession={() => addNode("claude-session")}
        />

        <div className={`main ${canvasCollapsed ? "collapsed" : ""}`}>
          {!canvasCollapsed && (
          <div className="canvas">
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeClick={onEdgeClick}
            onEditEdge={(id) => {
              setSelectedEdge(id);
              setInspectorOpen(true);
            }}
            onDeleteEdge={(id) => {
              setEdges((es) => es.filter((x) => x.id !== id));
              setSelectedEdge((s) => (s === id ? null : s));
            }}
            onCopyNode={(id) => copySelected(id)}
            onDeleteNode={(id) => deleteNodeById(id)}
            onPaneClick={onPaneClick}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            helperLines={helperLines}
            activeEdges={activeEdgeIds}
            focusEdges={focusEdgeIds}
            edgeStats={edgeStats}
            theme={resolvedTheme}
            nodeMetas={sessionMetas}
          />

          {/* 多选(≥2)时浮出对齐/分布工具条 */}
          {multiSelectCount >= 2 && (
            <AlignBar count={multiSelectCount} onAlign={alignSelected} onDistribute={distributeSelected} />
          )}

          {/* 浮窗：连线条件编辑（条件分流） */}
          {inspectorOpen && selectedEdgeObj && (
            <div className="popup popup-inspector" style={{ "--nc": "#cf6f2e" } as CSSProperties}>
              <div className="popup-head">
                <span className="pi-head-title">
                  <span className="pi-head-icon">🎯</span>
                  {t("连线意图（分流）")}
                </span>
                <button className="popup-x" onClick={() => setSelectedEdge(null)} title={t("隐藏")}>
                  ×
                </button>
              </div>
              <div className="popup-body">
                <div className="inspector">
                  <div className="hint" style={{ marginBottom: 8 }}>
                    {edgeEndLabel(selectedEdgeObj.source)} → {edgeEndLabel(selectedEdgeObj.target)}
                  </div>
                  <label className="field" style={{ alignItems: "flex-start" }}>
                    <span>{t("触发意图")}</span>
                    <textarea
                      rows={3}
                      style={{ flex: 1, background: "var(--input)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text)", padding: "4px 6px" }}
                      value={(selectedEdgeObj.data as { condition?: string } | undefined)?.condition ?? ""}
                      placeholder={t("留空=默认边。填一句意图，如：用户想触发打包/角色管线CI/构建")}
                      onChange={(e) => setEdgeCondition(selectedEdgeObj.id, e.target.value)}
                    />
                  </label>
                  <div className="hint">
                    {t("同一节点有多条带意图的出边时，引擎用 LLM 判断消息属于哪条；都不命中走「留空」的默认边。")}
                  </div>
                  <button
                    className="del-btn"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      setEdges((eds) => eds.filter((x) => x.id !== selectedEdgeObj.id));
                      setSelectedEdge(null);
                    }}
                  >
                    {t("🗑 删除连线")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 节点编辑浮窗已移到 main 层级（见下），画布收起时也能编辑选中的会话 */}

          {/* 左上角工具条：分类「＋ 添加节点」下拉（参考美术稿） */}
          <div className="canvas-toolbar">
            <div className="add-node-wrap">
              <button
                className={`add-node-btn ${addMenuOpen ? "on" : ""}`}
                data-popup="addmenu"
                onClick={() => setAddMenuOpen((o) => !o)}
                title={t("添加节点")}
              >
                <span className="anb-plus">＋</span> {t("添加节点")}
                <span className="anb-caret">▾</span>
              </button>
              {addMenuOpen && (
                <div className="add-menu">
                  {ADD_GROUPS.map((g) => (
                    <div className="add-group" key={g.title}>
                      <div className="add-group-title">{t(g.title)}</div>
                      {g.items.map((it) => (
                        <button
                          className="add-item"
                          key={it.kind}
                          onClick={() => {
                            addNode(it.kind, cmdkCenter());
                            setAddMenuOpen(false);
                          }}
                        >
                          <span className="add-item-icon" style={{ background: `${it.color}1f`, color: it.color }}>
                            {it.icon}
                          </span>
                          {t(it.label)}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 加节点：左上角工具条 / 右键空白处 / 从端口拖到空白；底部留一行淡提示 */}
          <div className="canvas-hint">{t("右键添加节点 · 从端口拖到空白接新节点 · 滚轮缩放 · Ctrl+Z 撤销")}</div>
          </div>
          )}

        {/* 节点视图与面板视图互斥(全宽)：画布展开=只看画布，便于编辑；切面板=只看终端/转录等。
            resizer 不再需要(两视图各自占满)。 */}

        {/* 浮窗：飞书连接（挂在 main 层级，画布收起时也能用） */}
        {feishuOpen && (
          <div className="popup popup-feishu">
            <div className="popup-head">
              <span>{t("飞书连接")}</span>
              <button className="popup-x" onClick={() => setFeishuOpen(false)} title={t("隐藏")}>
                ×
              </button>
            </div>
            <div className="popup-body">
              <FeishuPanel
                client={client}
                config={config}
                state={feishu}
                owners={config?.owners ?? []}
                onSetOwners={setOwners}
                lookupResult={openidResult}
                onLookup={(mobile, email) => {
                  setOpenidResult(null);
                  client.send({ type: "lookup-openid", mobile, email });
                }}
                onSetHomeChat={setHomeChat}
              />
            </div>
          </div>
        )}

        {/* 设置浮窗（左下角设置按钮触发）：当前放主题切换 */}
        {costOpen && (
          <div className="popup popup-cost">
            <div className="popup-head">
              <span>📊 {t("成本看板")}</span>
              <button className="popup-x" onClick={() => setCostOpen(false)} title={t("隐藏")}>
                ×
              </button>
            </div>
            <div className="popup-body popup-cost-body">
              <CostPanel cost={cost} />
            </div>
          </div>
        )}
        {settingsOpen && (
          <div className="popup popup-settings">
            <div className="popup-head">
              <span>{t("设置")}</span>
              <button className="popup-x" onClick={() => setSettingsOpen(false)} title={t("隐藏")}>
                ×
              </button>
            </div>
            <div className="popup-body">
              {/* 语言切换器本身刻意不走 t()：固定双语/英文，做"通用入口"，谁都找得到、不随界面语言翻转 */}
              <div className="settings-label">语言 · Language</div>
              <div className="seg">
                {(
                  [
                    ["zh", "中文"],
                    ["en", "English"],
                  ] as [Lang, string][]
                ).map(([v, label]) => (
                  <button key={v} className={`seg-btn ${lang === v ? "on" : ""}`} onClick={() => setLang(v)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                Switch the interface language. Technical terms / identifiers stay as-is; untranslated parts
                temporarily show Chinese and are being filled in.
              </div>

              <div className="settings-label" style={{ marginTop: 16 }}>{t("主题")}</div>
              <div className="seg">
                {(
                  [
                    ["dark", t("深色"), IconMoon],
                    ["light", t("浅色"), IconSun],
                    ["system", t("跟随系统"), IconMonitor],
                  ] as [ThemePref, string, (p: { size?: number }) => JSX.Element][]
                ).map(([v, label, Icon]) => (
                  <button key={v} className={`seg-btn ${theme === v ? "on" : ""}`} onClick={() => applyTheme(v)}>
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
              {themeNotice ? (
                <div className="settings-notice" style={{ marginTop: 10 }}>
                  <div className="hint">
                    已同步 Claude 终端主题（写入 <code>~/.claude/settings.json</code>）。但<b>已开着的终端里
                    Claude 已画出的内容</b>(diff/语法色)还是旧色，需重开终端才会按新主题重渲染。
                  </div>
                  {openedTerminals.length > 0 && (
                    <button
                      className="notice-btn"
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        reopenAllTerminals();
                        setThemeNotice(false);
                      }}
                    >
                      🔄 {t("重开所有终端（{0}）—— 会话保留", openedTerminals.length)}
                    </button>
                  )}
                </div>
              ) : (
                <div className="hint" style={{ marginTop: 10 }}>
                  {t("切换会一并设置 Claude 终端主题；浅色参考 Claude 主页配色，部分细节仍在调。")}
                </div>
              )}

              <div className="settings-label" style={{ marginTop: 16 }}>{t("完成任务桌面提示")}</div>
              <div className="seg">
                {(
                  [
                    [false, t("关")],
                    [true, t("开")],
                  ] as [boolean, string][]
                ).map(([v, label]) => (
                  <button
                    key={String(v)}
                    className={`seg-btn ${completionAlert === v ? "on" : ""}`}
                    onClick={() => setCompletionAlert(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                {t("后台跑完任务时，右下角弹个小人提醒，点它回到会话。")}
              </div>
              {completionAlert && (
                <div style={{ marginTop: 10 }}>
                  <div className="settings-label" style={{ marginBottom: 6 }}>
                    {t("小人停留时长：{0} 秒", mascotSec)}
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={20}
                    value={mascotSec}
                    onChange={(e) => setMascotSec(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <div className="fs-actions" style={{ marginTop: 6 }}>
                    <button onClick={() => showMascot("", t("位置预览"))} title={t("按当前时长弹一下小人看看效果（屏幕右下角）")}>
                      {t("👀 预览")}
                    </button>
                  </div>
                </div>
              )}

              <div className="settings-label" style={{ marginTop: 16 }}>{t("终端字号：{0}px", termFontSize)}</div>
              <input
                type="range"
                min={9}
                max={28}
                value={termFontSize}
                onChange={(e) => setTermFontSize(Number(e.target.value))}
                style={{ width: "100%" }}
              />
              <div className="hint" style={{ marginTop: 6 }}>
                {t("拖动调整所有终端字号；终端里也可 Ctrl + +/− 调整、Ctrl+0 复位。")}
              </div>

              <div className="settings-label" style={{ marginTop: 16 }}>{t("全局唤起热键（默认关）")}</div>
              <div className="seg">
                {(
                  [
                    [false, t("关")],
                    [true, t("开")],
                  ] as [boolean, string][]
                ).map(([v, label]) => (
                  <button
                    key={String(v)}
                    className={`seg-btn ${hotkeyEnabled === v ? "on" : ""}`}
                    onClick={() => setHotkeyEnabled(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {hotkeyEnabled && (
                <>
                  <input
                    value={hotkeyKey}
                    onChange={(e) => setHotkeyKey(e.target.value)}
                    placeholder={t("如 CommandOrControl+Shift+O")}
                    style={{ width: "100%", marginTop: 6 }}
                  />
                  <div className="hint" style={{ marginTop: 6 }}>
                    {t("按组合键把窗口唤到最前。格式如 CommandOrControl+Shift+O、Alt+Space；不生效多半是被别的软件占用了，换一个。")}
                  </div>
                </>
              )}

              <div className="settings-label" style={{ marginTop: 16 }}>{t("画布配置")}</div>
              <div className="fs-actions">
                <button onClick={exportCanvas} title={t("把整张画布导出成 JSON 文件（已抹会话身份/密钥），可分享/进 git")}>
                  {t("⬇ 导出")}
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  title={t("从 JSON 文件导入画布（会替换当前画布）")}
                >
                  {t("⬆ 导入")}
                </button>
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCanvas(f);
                  e.target.value = ""; // 允许再次选同一个文件
                }}
              />
              <div className="hint" style={{ marginTop: 6 }}>
                {t("导出抹掉会话身份与密钥；导入后会话首次收到飞书消息会自动重新 fork。")}
              </div>

              <div className="settings-label" style={{ marginTop: 16 }}>{t("项目")}</div>
              <div className="fs-actions">
                <button
                  title={t("在浏览器打开项目仓库（GitHub）")}
                  onClick={() =>
                    void invoke("open_path", {
                      path: "https://github.com/RudAns/OblivionisAgent",
                      base: "",
                    }).catch(() => {})
                  }
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    style={{ marginRight: 5, verticalAlign: "-2px" }}
                    aria-hidden
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 014 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  GitHub
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 节点编辑浮窗：挂在 main 层级，画布收起(终端为主)时也能编辑选中的会话——不再是死胡同。
            多选(≥2)时不显单节点检视，避免"显示一个却以为操作全局"的误导(改由对齐工具条主导)。 */}
        {inspectorOpen && selectedNode && multiSelectCount < 2 && (
          <div
            className="popup popup-inspector"
            style={{ "--nc": NODE_COLOR[selectedNode.type ?? ""] ?? "#8a93a0" } as CSSProperties}
          >
            <div className="popup-head">
              <span className="pi-head-title">
                <span className="pi-head-icon">{NODE_ICON[selectedNode.type ?? ""] ?? "▦"}</span>
                {t("{0} 设置", t(NODE_LABEL[selectedNode.type ?? ""] ?? "节点"))}
                {canvasCollapsed ? t("（画布已收起）") : ""}
              </span>
              <button className="popup-x" onClick={() => setInspectorOpen(false)} title={t("隐藏")}>
                ×
              </button>
            </div>
            <div className="popup-body">
              <Inspector
                node={selectedNode}
                onPatch={patchSelected}
                onDelete={deleteSelected}
                sessions={sessions}
                onListSessions={(cwd) => client.send({ type: "list-sessions", cwd })}
                onRefreshSnapshot={(nodeId) => client.send({ type: "prepare-fork", nodeId })}
                onReinjectSoul={(nodeId) => client.send({ type: "reinject-soul", nodeId })}
                onEditSoul={(nodeId) => client.send({ type: "ensure-soul", nodeId })}
                onEditSkill={(nodeId) => client.send({ type: "ensure-skill", nodeId })}
                onEditSubagent={(nodeId) => client.send({ type: "ensure-subagent", nodeId })}
                onEditGroupMemory={(chatId) => client.send({ type: "ensure-group-memory", chatId })}
              />
              {selectedIsClaude && (
                <div className="test-box">
                  <input
                    value={testText}
                    placeholder={t("给该会话发测试消息（绕过飞书）")}
                    onChange={(e) => setTestText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendTest()}
                  />
                  <button onClick={sendTest}>{t("发送")}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 画布展开时隐藏面板(但保持挂载，终端不掉)；收起时面板占满 */}
        <aside className="side" style={canvasCollapsed ? { flex: 1, minWidth: 0 } : { display: "none" }}>
          {/* 终端 / 转录是同一个会话的两种视图 → 面板顶部小页签切换（左侧选会话只换"哪个会话"，视图粘滞）。
              其余(审计/日志/收件箱)是全局面板，标题旁直接写一句功能说明。 */}
          {(tab === "terminal" || tab === "transcript") ? (
            <div className="panel-title panel-title-tabs">
              <span className="pt-label">
                {tab === "terminal"
                  ? activeTermLabel
                    ? t("终端 · {0}", activeTermLabel)
                    : t("终端 · 开发会话")
                  : TAB_TITLE.transcript}
              </span>
              <span className="panel-subtabs">
                <button
                  className={`subtab ${tab === "terminal" ? "on" : ""}`}
                  title={t("这个会话的开发终端（软件里的本地 Claude 会话）")}
                  onClick={showTerminalView}
                >
                  🖥 终端
                </button>
                <button
                  className={`subtab ${tab === "transcript" ? "on" : ""}`}
                  title={t("这个会话的飞书脱敏分身回复转录")}
                  onClick={showTranscriptView}
                >
                  📝 转录
                </button>
              </span>
            </div>
          ) : (
            <div className="panel-title">
              <span className="pt-label">{TAB_TITLE[tab]}</span>
              {TAB_DESC[tab] && <span className="pt-desc">{TAB_DESC[tab]}</span>}
            </div>
          )}

          <div className="panel">
            {tab === "transcript" && (
              <TranscriptPanel
                nodeId={selectedIsClaude ? selected : null}
                events={selected ? eventsRef.current[selected] ?? [] : []}
              />
            )}
            {/* 终端常驻挂载（按标签显隐），切标签/切节点都不卸载 → 会话保活 */}
            <div
              className="term-pane"
              style={{ display: tab === "terminal" ? "block" : "none", height: "100%", overflow: "hidden" }}
            >
              <TerminalsHost
                terminals={termInfos}
                activeId={activeTerminalId}
                onActivate={(id) => {
                  setActiveTerminal(id);
                  setSelected(id);
                }}
                onClose={(id) => {
                  setOpenedTerminals((o) => o.filter((x) => x !== id));
                  setActiveTerminal((a) => (a === id ? null : a));
                }}
                onReorder={(dragId, dropId, after) =>
                  setOpenedTerminals((o) => {
                    const a = o.filter((x) => x !== dragId);
                    const ti = a.indexOf(dropId);
                    if (ti < 0) return o;
                    a.splice(after ? ti + 1 : ti, 0, dragId); // 落点页签之前/之后
                    return a;
                  })
                }
                theme={resolvedTheme}
                onActivity={(id, r) =>
                  setTermRunning((m) => (m[id] === r ? m : { ...m, [id]: r }))
                }
                onTaskDone={(id) => {
                  // 一次用户发起的正式任务跑完、而我没在看这个会话 → 插完成小红旗
                  // (打开会话时 claude 启动的输出不算任务，故不会误插)
                  if (activeTermRef.current !== id) {
                    setUnseenDone((u) => (u[id] ? u : { ...u, [id]: true }));
                  }
                  // 完成提示开着：任务跑完且主窗口没在聚焦/最小化时 → 右下角弹小人窗口
                  if (completionAlert) {
                    void (async () => {
                      if (!("__TAURI_INTERNALS__" in window)) return;
                      try {
                        const w = getCurrentWindow();
                        const [focused, minimized] = await Promise.all([w.isFocused(), w.isMinimized()]);
                        if (focused && !minimized) return; // 正看着这软件，不打扰
                      } catch {
                        /* ignore */
                      }
                      const node = nodes.find((n) => n.id === id);
                      const label = (node?.data as { label?: string } | undefined)?.label || "会话";
                      showMascot(id, label);
                    })();
                  }
                }}
              />
            </div>
            {tab === "audit" && (
              <AuditPanel
                items={inbox}
                owners={config?.owners ?? []}
                groupName={(chatId) => {
                  const g = nodes.find(
                    (n) => n.type === "feishu-group" && (n.data as any).chatId === chatId,
                  );
                  return (g?.data as any)?.label ?? t("(未命名群)");
                }}
              />
            )}
            {tab === "logs" && <LogPanel lines={logs} />}
            {tab === "inbox" && (
              <InboxPanel
                items={knowledge}
                onDecide={(id, action, editedRule) =>
                  client.send({ type: "knowledge-decide", id, action, editedRule })
                }
              />
            )}
          </div>
        </aside>
        </div>
      </div>

      <StatusBar
        bridgeUp={bridgeUp}
        sessionCount={claudeNodes.length}
        openTerminals={openedTerminals.length}
        activeLabel={
          activeTerminalId
            ? ((nodes.find((n) => n.id === activeTerminalId)?.data as { label?: string })?.label ?? null)
            : null
        }
        ctx={ctx}
        onCtxHover={fetchCtx}
        saved={savedFlash}
      />

      {/* 右键菜单（节点/连线/空白）：portal 到 body，避开画布 transform 影响定位 */}
      {ctxMenu &&
        createPortal(
          <div
            className="ctx-backdrop"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu(null);
            }}
          >
            <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
              {ctxMenu.kind === "node" &&
                (() => {
                  const n = nodes.find((x) => x.id === ctxMenu.id);
                  return (
                    <>
                      <button
                        className="ctx-item"
                        onClick={() => {
                          setSelected(ctxMenu.id!);
                          setSelectedEdge(null);
                          setInspectorOpen(true);
                          setCtxMenu(null);
                        }}
                      >
                        {t("✎ 编辑")}
                      </button>
                      {n?.type === "claude-session" && (
                        <button
                          className="ctx-item"
                          onClick={() => {
                            openTerminalForNode(ctxMenu.id!);
                            setCtxMenu(null);
                          }}
                        >
                          {t("⌨ 打开终端")}
                        </button>
                      )}
                      <button
                        className="ctx-item"
                        title={t("就地生成一个副本（不经剪贴板）")}
                        onClick={() => {
                          duplicateNodeById(ctxMenu.id!);
                          setCtxMenu(null);
                        }}
                      >
                        {t("⧉ 再制")} <span className="ctx-kbd">Ctrl+D</span>
                      </button>
                      <button
                        className="ctx-item"
                        title={t("放入剪贴板，可粘贴到别处（含组内连线）")}
                        onClick={() => {
                          copySelected(ctxMenu.id);
                          setCtxMenu(null);
                        }}
                      >
                        {t("⎘ 复制")} <span className="ctx-kbd">Ctrl+C</span>
                      </button>
                      <div className="ctx-sep" />
                      {(() => {
                        const broken = edges.filter((e) => e.source === ctxMenu.id || e.target === ctxMenu.id).length;
                        return (
                          <button
                            className="ctx-item danger"
                            title={t("删除节点及其连线（可 Ctrl+Z 撤销）")}
                            onClick={() => {
                              const id = ctxMenu.id!;
                              setCtxMenu(null);
                              deleteNodeById(id);
                            }}
                          >
                            {t("🗑 删除")}{broken > 0 ? t("（断开 {0} 条连线）", broken) : ""}
                          </button>
                        );
                      })()}
                    </>
                  );
                })()}
              {ctxMenu.kind === "edge" && (
                <>
                  <button
                    className="ctx-item"
                    onClick={() => {
                      setSelectedEdge(ctxMenu.id!);
                      setSelected(null);
                      setInspectorOpen(true);
                      setCtxMenu(null);
                    }}
                  >
                    {t("✎ 设置意图条件")}
                  </button>
                  <div className="ctx-sep" />
                  <button
                    className="ctx-item danger"
                    title={t("删除连线（可 Ctrl+Z 撤销）")}
                    onClick={() => {
                      const id = ctxMenu.id;
                      setEdges((es) => es.filter((x) => x.id !== id));
                      setSelectedEdge((s) => (s === id ? null : s));
                      setCtxMenu(null);
                    }}
                  >
                    {t("🗑 删除连线")}
                  </button>
                </>
              )}
              {ctxMenu.kind === "pane" && (
                <>
                  {hasClipboard && (
                    <>
                      <button
                        className="ctx-item"
                        onClick={() => {
                          pasteClipboard(ctxMenu.flow);
                          setCtxMenu(null);
                        }}
                      >
                        {t("📋 粘贴到此处")} <span className="ctx-kbd">Ctrl+V</span>
                      </button>
                      <div className="ctx-sep" />
                    </>
                  )}
                  <div className="ctx-head">{t("在此处添加节点")}</div>
                  {PALETTE.map(([kind, label]) => (
                    <button
                      key={kind}
                      className="ctx-item"
                      onClick={() => {
                        addNode(kind, ctxMenu.flow);
                        setCtxMenu(null);
                      }}
                    >
                      ＋ {t(label)}
                    </button>
                  ))}
                  <div className="ctx-sep" />
                  <button
                    className="ctx-item"
                    onClick={() => {
                      rf.fitView({ duration: 300, padding: 0.2 });
                      setCtxMenu(null);
                    }}
                  >
                    {t("⤢ 适应视图")}
                  </button>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      {/* 拖线到空白处：弹「可连的节点类型」，选一个自动建好并连上(像专业节点编辑器) */}
      {dropMenu &&
        createPortal(
          <div className="ctx-backdrop" onClick={() => setDropMenu(null)} onContextMenu={(e) => { e.preventDefault(); setDropMenu(null); }}>
            <div className="ctx-menu" style={{ left: dropMenu.sx, top: dropMenu.sy }} onClick={(e) => e.stopPropagation()}>
              <div className="ctx-head">{t("在此处新建并连上")}</div>
              {dropMenu.opts.map((opt) => (
                <button
                  key={opt.kind + (opt.handle ?? "")}
                  className="ctx-item"
                  onClick={() => {
                    addNodeConnected(opt.kind, dropMenu.flowPos, dropMenu.srcId, opt.handle);
                    setDropMenu(null);
                  }}
                >
                  ＋ {t(NODE_LABEL[opt.kind] ?? opt.kind)}
                  {opt.handle === "fork" ? t("（人格口）") : ""}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}

      {/* Ctrl+K 命令面板：搜索式快速添加节点 / 运行画布命令 */}
      {cmdkOpen &&
        createPortal(
          <div className="cmdk-backdrop" onClick={() => setCmdkOpen(false)}>
            <div className="cmdk" onClick={(e) => e.stopPropagation()}>
              <input
                className="cmdk-input"
                autoFocus
                placeholder={t("搜索命令 / 添加节点…（↑↓ 选择，Enter 执行，Esc 关闭）")}
                value={cmdkQuery}
                onChange={(e) => {
                  setCmdkQuery(e.target.value);
                  setCmdkIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setCmdkOpen(false);
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCmdkIndex((i) => Math.min(i + 1, cmdkFiltered.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCmdkIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const c = cmdkFiltered[cmdkIndex];
                    if (c) {
                      c.run();
                      setCmdkOpen(false);
                    }
                  }
                }}
              />
              <div className="cmdk-list">
                {cmdkFiltered.length === 0 && <div className="cmdk-empty">{t("没有匹配的命令")}</div>}
                {cmdkFiltered.map((c, i) => (
                  <button
                    key={c.id}
                    className={`cmdk-item ${i === cmdkIndex ? "active" : ""}`}
                    onMouseEnter={() => setCmdkIndex(i)}
                    onClick={() => {
                      c.run();
                      setCmdkOpen(false);
                    }}
                  >
                    <span>{c.label}</span>
                    {c.hint && <span className="cmdk-hint">{c.hint}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function Inspector({
  node,
  onPatch,
  onDelete,
  sessions,
  onListSessions,
  onRefreshSnapshot,
  onReinjectSoul,
  onEditSoul,
  onEditSkill,
  onEditSubagent,
  onEditGroupMemory,
}: {
  node: Node | null;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  sessions: SessionInfo[];
  onListSessions: (cwd: string) => void;
  onRefreshSnapshot: (nodeId: string) => void;
  onReinjectSoul: (nodeId: string) => void;
  onEditSoul: (nodeId: string) => void;
  onEditSkill: (nodeId: string) => void;
  onEditSubagent: (nodeId: string) => void;
  onEditGroupMemory: (chatId: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickFilter, setPickFilter] = useState("");
  const t = useT();
  useEffect(() => {
    setShowPicker(false);
    setPickFilter("");
  }, [node?.id]); // 切换节点自动收起列表
  if (!node) return <div className="inspector empty">{t("点画布上的节点进行编辑")}</div>;
  const d = node.data as Record<string, any>;
  const field = (label: string, value: string, key: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={value ?? ""} onChange={(e) => onPatch({ [key]: e.target.value })} />
    </label>
  );
  const fieldArea = (label: string, value: string, key: string, rows = 3, placeholder?: string) => (
    <label className="field" style={{ alignItems: "flex-start" }}>
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onPatch({ [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="inspector">
      <div className="inspector-head">
        <span className="inspector-title">{t(NODE_LABEL[node.type ?? ""] ?? node.type ?? "")}</span>
        <button className="del-btn" onClick={onDelete} title={t("删除此节点及其连线（可 Ctrl+Z 撤销）")}>
          {t("🗑 删除")}
        </button>
      </div>
      {field(t("名称"), d.label, "label")}
      {node.type === "feishu-group" && (
        <>
          {field("chatId (oc_...)", d.chatId, "chatId")}
          <label className="field">
            <span>{t("触发")}</span>
            <select value={d.triggerMode} onChange={(e) => onPatch({ triggerMode: e.target.value })}>
              <option value="mention">{t("@机器人才触发")}</option>
              <option value="all">{t("群内全部消息")}</option>
            </select>
          </label>
          <div className="fs-actions">
            <button
              disabled={!d.chatId}
              title={t("查看/编辑机器人对本群积累的长期记忆（GROUP.md，会自动维护，注入到该群会话）")}
              onClick={() => d.chatId && onEditGroupMemory(d.chatId)}
            >
              {t("🧠 群记忆 (GROUP.md)")}
            </button>
          </div>
        </>
      )}
      {node.type === "route" && (
        <>
          <div className="hint" style={{ marginBottom: 6 }}>
            {t("发给 Claude 前会自动去掉飞书 @ 占位符（无需配置）。这里只设可选「前缀」。")}
          </div>
          {fieldArea(t("前缀"), d.prefix, "prefix", 3, t("可选。该路由下消息统一加的前缀（可多行）"))}
        </>
      )}
      {node.type === "soul" && (
        <>
          <div className="hint" style={{ marginBottom: 6 }}>
            {t("人格 (SOUL.md)。把本节点右侧 ● 连到「Claude 会话」的 🎭人格口；连上即作用于该会话的所有飞书回复（fork 脱敏分身）。一个人格可连多个会话；未连任何会话则不生效。")}
          </div>
          <div className="fs-actions">
            <button
              title={t("编辑这份人格文件 SOUL.md（首次自动生成模板，保存即生效）。人格只影响表达风格，访客安全护栏始终优先。")}
              onClick={() => node && onEditSoul(node.id)}
            >
              {t("🎭 编辑灵魂 (SOUL.md)")}
            </button>
            <button
              className="ghost"
              title={t("把这份人格立即重新注入到所有连着它的会话(留记忆)：往每个会话的 fork 静默跑一轮『切换到此人格』，用最近一轮压过历史里养成的旧口吻惯性。改完人格 / 刚连上会话后用它，比『刷新快照』轻——不清记忆。")}
              onClick={() => node && onReinjectSoul(node.id)}
            >
              {t("🔁 重锚到所连会话")}
            </button>
          </div>
        </>
      )}
      {node.type === "skill" && (
        <>
          <div className="hint" style={{ marginBottom: 6 }}>
            {t("技能 (SKILL.md)：操作性指令 / 话术 / 输出格式，和人格互补（人格管怎么说话，技能管怎么做事）。把本节点右侧 ● 连到「Claude 会话」的 🎭人格/🧩技能口；一个会话可连多个技能。")}
          </div>
          <div className="fs-actions">
            <button
              title={t("编辑这份技能文件 SKILL.md（首次自动生成模板，保存即生效）")}
              onClick={() => node && onEditSkill(node.id)}
            >
              {t("🧩 编辑技能 (SKILL.md)")}
            </button>
          </div>
        </>
      )}
      {node.type === "subagent" && (
        <>
          <div className="hint" style={{ marginBottom: 6 }}>
            {t("子代理：一个 Claude Code 原生子代理（独立上下文 + 独立工具）。会话里的 claude 会用 Task 工具按它的 description 自动委派给它做重活（文档/日志总结、消息分类），不污染主会话。连到会话的 🎭人格/🧩技能口作组织标识。")}
          </div>
          <div className="fs-actions">
            <button
              title={t("编辑子代理定义（首次自动生成模板，写在 ~/.claude/agents/，claude 自动发现）。务必改 name(英文唯一)+description(写清何时用)。")}
              onClick={() => node && onEditSubagent(node.id)}
            >
              {t("🦾 编辑子代理")}
            </button>
          </div>
        </>
      )}
      {node.type === "webhook" && (
        <>
          <div className="hint" style={{ marginBottom: 6 }}>
            {t("外部系统（Jenkins/CI/GitHub）POST 到下面这个地址即触发；把它连到一个「Claude 会话」节点。")}
          </div>
          <div className="base-session">
            <div className="base-session-title">{t("回调地址（POST · 同网段可达）")}</div>
            <div className="owner-row">
              <span className="owner-id" title={`http://<${t("本机IP")}>:8921/hook/${d.token ?? ""}`}>
                {`http://<${t("本机IP")}>:8921/hook/${d.token ?? ""}`}
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(`/hook/${d.token ?? ""}`).catch(() => {})}
                title={t("复制路径")}
              >
                {t("复制")}
              </button>
            </div>
          </div>
          {field(t("指令模板（{{body}}=请求体）"), d.prompt, "prompt")}
          {field(t("投递群 chatId"), d.chatId, "chatId")}
          {field(t("HMAC 密钥（可选）"), d.secret, "secret")}
          <div className="hint" style={{ marginBottom: 6 }}>
            {t("HMAC 密钥设了就校验请求签名头（X-Hub-Signature-256 / X-Signature），防伪造回调；留空=不校验。每 token 限流 60 次/分钟。")}
          </div>
          <div className="hint" style={{ marginBottom: 6 }}>
            {t("留空 = 发到 Home Chat。外网回调需自建隧道（cloudflared/ngrok 指向 8921）。")}
          </div>
          <label className="field">
            <span>{t("启用")}</span>
            <input
              type="checkbox"
              checked={d.enabled !== false}
              onChange={(e) => onPatch({ enabled: e.target.checked })}
            />
          </label>
        </>
      )}
      {node.type === "cron" && (
        <>
          {field(t("触发时刻"), d.schedule, "schedule")}
          <div className="hint" style={{ marginBottom: 6 }}>
            {t("支持：09:00(每天) · every 30m / every 2h(间隔)")}
          </div>
          {field(t("指令 prompt"), d.prompt, "prompt")}
          {field(t("投递群 chatId"), d.chatId, "chatId")}
          <div className="hint" style={{ marginBottom: 6 }}>
            {t("留空 = 发到 Home Chat（在「飞书连接」面板设置）；连线到一个「Claude 会话」节点即生效")}
          </div>
          <label className="field">
            <span>{t("启用")}</span>
            <input
              type="checkbox"
              checked={d.enabled !== false}
              onChange={(e) => onPatch({ enabled: e.target.checked })}
            />
          </label>
        </>
      )}
      {node.type === "intent-switch" && (
        <>
          {field(t("分类模型(可空=haiku)"), d.model, "model")}
          <label className="field">
            <span>{t("判定模式")}</span>
            <select value={d.mode ?? "best"} onChange={(e) => onPatch({ mode: e.target.value })}>
              <option value="best">{t("最佳匹配")}</option>
              <option value="priority">{t("优先级(连线顺序)")}</option>
            </select>
          </label>
          <div className="hint">
            {t("从该节点右侧拉多条线到不同会话，点每条线设「触发意图」；留空的线=默认边。")}
          </div>
        </>
      )}
      {node.type === "claude-session" && (
        <>
          {field(t("工作目录 cwd"), d.cwd, "cwd")}
          {field(t("模型(可空)"), d.model, "model")}
          <label className="field">
            <span>{t("主人权限(你@时)")}</span>
            <select
              value={d.permissionMode}
              onChange={(e) => onPatch({ permissionMode: e.target.value })}
            >
              {["default", "acceptEdits", "auto", "dontAsk", "bypassPermissions", "plan"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("访客权限(他人@时)")}</span>
            <select
              value={d.guestPermissionMode ?? "default"}
              onChange={(e) => onPatch({ guestPermissionMode: e.target.value })}
            >
              {["default", "plan", "acceptEdits", "auto", "dontAsk", "bypassPermissions"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          {field(t("追加 system prompt"), d.appendSystemPrompt, "appendSystemPrompt")}
          <label className="field">
            <span>{t("敏感操作飞书审批")}</span>
            <input
              type="checkbox"
              checked={!!d.approvalMode}
              title={t("工具调用需要授权时，向来源群发卡片由主人[允许/拒绝]（需 permissionMode=default 才会询问）")}
              onChange={(e) => onPatch({ approvalMode: e.target.checked })}
            />
          </label>

          <div className="base-session">
            <div className="base-session-title">{t("基础会话 (fork 来源，如「角色管线」会话)")}</div>
            <div className="field">
              <span>baseSessionId</span>
              <input
                value={d.baseSessionId ?? ""}
                placeholder={t("留空=普通会话；填入则首次 fork 一份知识底座")}
                onChange={(e) => onPatch({ baseSessionId: e.target.value || undefined })}
              />
            </div>
            <div className="fs-actions">
              <button
                onClick={() => {
                  if (showPicker) setShowPicker(false);
                  else {
                    onListSessions(d.cwd || "");
                    setShowPicker(true);
                  }
                }}
              >
                {showPicker ? t("收起列表") : t("列出该目录的会话…")}
              </button>
              {d.baseSessionId && (
                <button
                  className="ghost"
                  title={t("立即从基础会话重新 fork 访客会话并脱敏(抹掉密钥)，吸收最新开发内容。会清掉 fork 的对话记忆。（只想换人格口吻、不想丢记忆 → 去人格节点点「重锚到所连会话」）")}
                  onClick={() => node && onRefreshSnapshot(node.id)}
                >
                  {t("刷新快照(脱敏)")}
                </button>
              )}
            </div>
            {showPicker && (
              <input
                className="pick-filter"
                value={pickFilter}
                placeholder={t("粘贴 sessionId 或关键词搜索…")}
                onChange={(e) => setPickFilter(e.target.value.trim())}
              />
            )}
            {showPicker && sessions.length > 0 && (
              <div className="session-list">
                {sessions
                  .filter(
                    (s) =>
                      !pickFilter ||
                      s.id.includes(pickFilter) ||
                      (s.preview || "").includes(pickFilter),
                  )
                  .map((s) => (
                  <button
                    key={s.id}
                    className="session-item"
                    title={s.id}
                    onClick={() => {
                      onPatch({ baseSessionId: s.id });
                      setShowPicker(false);
                    }}
                  >
                    <div className="si-preview">{s.preview || t("(无预览)")}</div>
                    <div className="si-meta">
                      {new Date(s.mtime).toLocaleString()} · {(s.sizeBytes / 1024).toFixed(0)}KB ·{" "}
                      {s.id.slice(0, 8)}…
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showPicker && sessions.length === 0 && (
              <div className="fs-detail">{t("该目录暂无会话（确认 cwd 正确、且在该目录跑过 claude）")}</div>
            )}
            {showPicker &&
              pickFilter &&
              sessions.length > 0 &&
              !sessions.some(
                (s) => s.id.includes(pickFilter) || (s.preview || "").includes(pickFilter),
              ) && (
                <div className="fs-detail">
                  {t("无匹配。确认该 sessionId 属于此 cwd 目录；也可直接把 ID 粘到上面的 baseSessionId。")}
                </div>
              )}
          </div>

          <div className="hint">
            {t("运行会话 sid: ")}
            {d.sessionId ? d.sessionId : d.baseSessionId ? t("首次 fork 后生成") : t("首次运行生成")}
          </div>

          <div className="sec-summary" title={t("本会话的安全态势（脱敏 fork / 出站脱敏 / 护栏 / 权限分级）")}>
            <div className="sec-title">{t("🛡 安全态势")}</div>
            <div className={`sec-item ${d.baseSessionId ? "on" : "off"}`}>
              {d.baseSessionId ? "✓" : "—"} {t("访客走脱敏 fork（开发会话只读不被污染）")}
            </div>
            <div className="sec-item on">✓ {t("访客回复出站二次脱敏 + 安全护栏")}</div>
            <div className={`sec-item ${d.approvalMode ? "on" : "off"}`}>
              {d.approvalMode ? "✓" : "—"} {t("敏感操作飞书审批")}{d.approvalMode ? "" : t("（未开）")}
            </div>
            <div className="sec-item dim">
              {t("主人权限 {0} · 访客权限 {1}", d.permissionMode, d.guestPermissionMode ?? "default")}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
