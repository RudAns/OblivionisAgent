import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler,
} from "@xyflow/react";
import {
  DEFAULT_WS_PORT,
  type OblivionisConfig,
  type GraphNode,
  type ClaudeStreamEvent,
  type SessionInfo,
  type Owner,
  type UsageSnapshot,
  type KnowledgeItem,
} from "@oblivionis/shared";
import { invoke } from "@tauri-apps/api/core";
import { BridgeClient } from "./bridge-client.js";
import { FlowCanvas } from "./canvas/FlowCanvas.js";
import { TranscriptPanel } from "./panels/TranscriptPanel.js";
import { TerminalsHost, type TermInfo } from "./panels/TerminalsHost.js";
import { LogPanel, type LogLine } from "./panels/LogPanel.js";
import { AuditPanel, type AuditItem } from "./panels/AuditPanel.js";
import { InboxPanel } from "./panels/InboxPanel.js";
import { FeishuPanel, FeishuStatusDot, type FeishuState } from "./panels/FeishuPanel.js";
import { IconRail, type RailKey } from "./layout/IconRail.js";
import { SessionSidebar } from "./layout/SessionSidebar.js";
import { StatusBar } from "./layout/StatusBar.js";

type Tab = "transcript" | "terminal" | "audit" | "logs" | "inbox";

const NEW_NODE_DEFAULTS: Record<string, () => Omit<GraphNode, "id" | "position">> = {
  "feishu-group": () => ({
    kind: "feishu-group",
    label: "新群",
    data: { chatId: "", triggerMode: "mention" },
  }),
  route: () => ({
    kind: "route",
    label: "路由",
    data: { stripMention: true },
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
  const edges: Edge[] = config.graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null, // 人格连到会话的「原始口/Fork口」靠它区分
    label: e.condition || undefined,
    data: { condition: e.condition },
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
  const [config, setConfig] = useState<OblivionisConfig | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("transcript");
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
  const [bridgeUp, setBridgeUp] = useState(false); // 引擎 WS 连接状态（状态栏）
  const [usage, setUsage] = useState<UsageSnapshot | null>(null); // 订阅用量(5h/周)
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]); // 知识收件箱
  const eventsRef = useRef<Record<string, ClaudeStreamEvent[]>>({});
  const [, forceRender] = useState(0);
  const statusRef = useRef<Record<string, string>>({});
  const graphInit = useRef(false);
  const configRef = useRef<OblivionisConfig | null>(null);
  const lastSavedSig = useRef<string | null>(null);
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
    }, 800);
    return () => window.clearTimeout(t);
  }, [nodes, edges, client]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, id: crypto.randomUUID() }, eds)),
    [setEdges],
  );

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
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
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // 打开(保活)某会话节点的终端并切到终端标签（画布双击 / 折叠菜单双击共用）
  const openTerminalForNode = useCallback((nodeId: string) => {
    if (!termIds.current.has(nodeId)) termIds.current.set(nodeId, crypto.randomUUID());
    setSelected(nodeId);
    setActiveTerminal(nodeId);
    setOpenedTerminals((o) => (o.includes(nodeId) ? o : [...o, nodeId]));
    setTab("terminal");
  }, []);

  // 双击「Claude 会话」节点：打开它的开发终端
  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.type !== "claude-session") return;
      openTerminalForNode(node.id);
    },
    [openTerminalForNode],
  );

  /** 设置某条连线的条件(意图描述) */
  const setEdgeCondition = (edgeId: string, condition: string) => {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === edgeId
          ? { ...e, label: condition || undefined, data: { ...e.data, condition: condition || undefined } }
          : e,
      ),
    );
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

  const addNode = (kind: keyof typeof NEW_NODE_DEFAULTS) => {
    const base = NEW_NODE_DEFAULTS[kind]!();
    const id = crypto.randomUUID();
    const node: Node = {
      id,
      type: kind,
      position: { x: 80 + Math.round(60 * (nodes.length % 5)), y: 80 + 40 * nodes.length },
      data: { ...base.data, label: base.label, status: "idle" },
    };
    setNodes((n) => [...n, node]);
    setSelected(id);
  };

  const save = () => {
    if (!config) return;
    const graph = rfToGraph(nodes, edges);
    lastSavedSig.current = JSON.stringify(graph);
    client.send({ type: "set-config", config: { ...config, graph } });
  };

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

  /** 删除选中的节点及其连线（二次确认防误删；自动保存会同步引擎） */
  const deleteSelected = () => {
    if (!selected) return;
    const label =
      ((nodes.find((n) => n.id === selected)?.data as { label?: string })?.label as string) ?? "该节点";
    if (!window.confirm(`确定删除「${label}」及其全部连线？`)) return;
    setNodes((ns) => ns.filter((n) => n.id !== selected));
    setEdges((es) => es.filter((e) => e.source !== selected && e.target !== selected));
    setSelected(null);
  };

  const selectedNode = nodes.find((n) => n.id === selected) ?? null;
  const selectedIsClaude = selectedNode?.type === "claude-session";

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

  /** 左侧图标竖栏动作分发 */
  const onRailAction = (key: RailKey) => {
    switch (key) {
      case "canvas":
        setCanvasCollapsed(!canvasCollapsed);
        break;
      case "feishu":
        setFeishuOpen((o) => !o);
        break;
      default:
        setTab(key);
    }
  };

  // 面板标题：转录/终端跟随当前会话名，让"左侧选了谁→右侧看的是谁"一目了然
  const selectedLabel =
    (selectedNode?.data as { label?: string } | undefined)?.label ?? null;
  const activeTermLabel = activeTerminalId
    ? ((nodes.find((n) => n.id === activeTerminalId)?.data as { label?: string })?.label ?? null)
    : null;
  const pendingKnowledge = knowledge.filter((k) => k.status === "pending").length;
  const TAB_TITLE: Record<Tab, string> = {
    transcript: selectedIsClaude && selectedLabel ? `转录 · ${selectedLabel} 的访客会话` : "转录 · 访客会话（左侧选择一个会话）",
    terminal: activeTermLabel ? `终端 · ${activeTermLabel}` : "终端 · 开发会话",
    audit: "审计 · 谁问了什么",
    logs: "服务日志",
    inbox: `知识收件箱${pendingKnowledge ? ` · ${pendingKnowledge} 条待裁决` : ""}`,
  };

  return (
    <div className="app">
      <header className="toolbar">
        <strong className="brand">
          Oblivionis<span className="brand-accent">Agent</span>
        </strong>
        <button
          className={`fs-chip ${feishuOpen ? "on" : ""}`}
          onClick={() => setFeishuOpen((o) => !o)}
          title="飞书连接（点开/收起设置）"
        >
          <FeishuStatusDot status={feishu.status} />
          飞书{feishu.bot?.name ? `：${feishu.bot.name}` : ""}
        </button>
        {selectedNode && !inspectorOpen && (
          <button onClick={() => setInspectorOpen(true)} title="编辑选中节点（画布收起时也可用）">
            ✎ 编辑节点
          </button>
        )}
        <div className="spacer" />
        {usage?.sessionPct != null && (
          <span
            className={`usage-chip ${usage.sessionPct >= 85 ? "hot" : usage.sessionPct >= 60 ? "warm" : ""}`}
            title={`Claude 订阅用量\n5小时窗口: ${usage.sessionPct}%${usage.sessionResets ? ` · ${usage.sessionResets}重置` : ""}${
              usage.weekPct != null ? `\n本周(全模型): ${usage.weekPct}%${usage.weekResets ? ` · ${usage.weekResets}重置` : ""}` : ""
            }\n每 5 分钟自动刷新`}
          >
            <span className="usage-bar">
              <span style={{ width: `${Math.min(100, usage.sessionPct)}%` }} />
            </span>
            5h {Math.round(usage.sessionPct)}%
            {usage.weekPct != null && <span className="usage-week">周 {Math.round(usage.weekPct)}%</span>}
          </span>
        )}
      </header>

      {unroutedActive && (
        <div className="banner">
          收到来自 <code>{unroutedActive}</code> 的消息，但没有匹配的群节点。
          <button onClick={() => addGroupForChat(unroutedActive)}>用该 chatId 新建群节点</button>
          <button className="ghost" onClick={() => setUnrouted(null)}>
            忽略
          </button>
        </div>
      )}

      <div className="shell">
        <IconRail
          canvasOpen={!canvasCollapsed}
          tab={tab}
          feishuOpen={feishuOpen}
          inboxBadge={pendingKnowledge}
          onAction={onRailAction}
        />
        <SessionSidebar
          claudeNodes={claudeNodes}
          selected={selected}
          activeTerminalId={activeTerminalId}
          openedTerminals={openedTerminals}
          onSelect={(id) => {
            setSelected(id);
            setTab("transcript");
          }}
          onOpenTerminal={openTerminalForNode}
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
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
          />

          {/* 浮窗：连线条件编辑（条件分流） */}
          {inspectorOpen && selectedEdgeObj && (
            <div className="popup popup-inspector">
              <div className="popup-head">
                <span>连线条件（分流）</span>
                <button className="popup-x" onClick={() => setSelectedEdge(null)} title="隐藏">
                  ×
                </button>
              </div>
              <div className="popup-body">
                <div className="inspector">
                  <div className="hint" style={{ marginBottom: 8 }}>
                    {edgeEndLabel(selectedEdgeObj.source)} → {edgeEndLabel(selectedEdgeObj.target)}
                  </div>
                  <label className="field" style={{ alignItems: "flex-start" }}>
                    <span>触发意图</span>
                    <textarea
                      rows={3}
                      style={{ flex: 1, background: "#14171c", border: "1px solid var(--border)", borderRadius: 5, color: "var(--text)", padding: "4px 6px" }}
                      value={(selectedEdgeObj.data as { condition?: string } | undefined)?.condition ?? ""}
                      placeholder="留空=默认边。填一句意图，如：用户想触发打包/角色管线CI/构建"
                      onChange={(e) => setEdgeCondition(selectedEdgeObj.id, e.target.value)}
                    />
                  </label>
                  <div className="hint">
                    同一节点有多条带意图的出边时，引擎用 LLM 判断消息属于哪条；都不命中走「留空」的默认边。
                  </div>
                  <button
                    className="del-btn"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      setEdges((eds) => eds.filter((x) => x.id !== selectedEdgeObj.id));
                      setSelectedEdge(null);
                    }}
                  >
                    🗑 删除连线
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 节点编辑浮窗已移到 main 层级（见下），画布收起时也能编辑选中的会话 */}

          {/* 画板浮动工具条：加节点（画板收起时自然隐藏） */}
          <div className="canvas-palette">
            <button onClick={() => addNode("feishu-group")}>+ 飞书群</button>
            <button onClick={() => addNode("route")}>+ 路由</button>
            <button onClick={() => addNode("intent-switch")}>+ 意图分流</button>
            <button onClick={() => addNode("claude-session")}>+ Claude 会话</button>
            <button onClick={() => addNode("cron")}>+ 定时任务</button>
            <button onClick={() => addNode("webhook")}>+ Webhook</button>
            <button onClick={() => addNode("soul")}>+ 人格</button>
          </div>
          </div>
          )}

        {!canvasCollapsed && (
          <div className="resizer" onMouseDown={startResize} title="拖动调整宽度" />
        )}

        {/* 浮窗：飞书连接（挂在 main 层级，画布收起时也能用） */}
        {feishuOpen && (
          <div className="popup popup-feishu">
            <div className="popup-head">
              <span>飞书连接</span>
              <button className="popup-x" onClick={() => setFeishuOpen(false)} title="隐藏">
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

        {/* 节点编辑浮窗：挂在 main 层级，画布收起(终端为主)时也能编辑选中的会话——不再是死胡同 */}
        {inspectorOpen && selectedNode && (
          <div className="popup popup-inspector">
            <div className="popup-head">
              <span>节点编辑{canvasCollapsed ? "（画布已收起）" : ""}</span>
              <button className="popup-x" onClick={() => setInspectorOpen(false)} title="隐藏">
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
                onEditSoul={(nodeId) => client.send({ type: "ensure-soul", nodeId })}
                onEditGroupMemory={(chatId) => client.send({ type: "ensure-group-memory", chatId })}
              />
              {selectedIsClaude && (
                <div className="test-box">
                  <input
                    value={testText}
                    placeholder="给该会话发测试消息（绕过飞书）"
                    onChange={(e) => setTestText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendTest()}
                  />
                  <button onClick={sendTest}>发送</button>
                </div>
              )}
            </div>
          </div>
        )}

        <aside className="side" style={canvasCollapsed ? { flex: 1, minWidth: 0 } : { width: panelWidth }}>
          <div className="panel-title">{TAB_TITLE[tab]}</div>

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
                  return (g?.data as any)?.label ?? "(未命名群)";
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
      />
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
  onEditSoul,
  onEditGroupMemory,
}: {
  node: Node | null;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  sessions: SessionInfo[];
  onListSessions: (cwd: string) => void;
  onRefreshSnapshot: (nodeId: string) => void;
  onEditSoul: (nodeId: string) => void;
  onEditGroupMemory: (chatId: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickFilter, setPickFilter] = useState("");
  useEffect(() => {
    setShowPicker(false);
    setPickFilter("");
  }, [node?.id]); // 切换节点自动收起列表
  if (!node) return <div className="inspector empty">点画布上的节点进行编辑</div>;
  const d = node.data as Record<string, any>;
  const field = (label: string, value: string, key: string) => (
    <label className="field">
      <span>{label}</span>
      <input value={value ?? ""} onChange={(e) => onPatch({ [key]: e.target.value })} />
    </label>
  );

  return (
    <div className="inspector">
      <div className="inspector-head">
        <span className="inspector-title">{node.type}</span>
        <button className="del-btn" onClick={onDelete} title="删除此节点及其连线">
          🗑 删除
        </button>
      </div>
      {field("名称", d.label, "label")}
      {node.type === "feishu-group" && (
        <>
          {field("chatId (oc_...)", d.chatId, "chatId")}
          <label className="field">
            <span>触发</span>
            <select value={d.triggerMode} onChange={(e) => onPatch({ triggerMode: e.target.value })}>
              <option value="mention">@机器人才触发</option>
              <option value="all">群内全部消息</option>
            </select>
          </label>
          <div className="fs-actions">
            <button
              disabled={!d.chatId}
              title="查看/编辑机器人对本群积累的长期记忆（GROUP.md，会自动维护，注入到该群会话）"
              onClick={() => d.chatId && onEditGroupMemory(d.chatId)}
            >
              🧠 群记忆 (GROUP.md)
            </button>
          </div>
        </>
      )}
      {node.type === "route" && (
        <>
          <label className="field">
            <span>去除 @</span>
            <input
              type="checkbox"
              checked={!!d.stripMention}
              onChange={(e) => onPatch({ stripMention: e.target.checked })}
            />
          </label>
          {field("前缀", d.prefix, "prefix")}
        </>
      )}
      {node.type === "soul" && (
        <>
          <div className="hint" style={{ marginBottom: 6 }}>
            人格 (SOUL.md)。把本节点右侧 ● 连到「Claude 会话」的 <b>🎭人格口</b>；连上即作用于该会话的
            所有飞书回复（fork 脱敏分身）。一个人格可连多个会话；未连任何会话则不生效。
          </div>
          <div className="fs-actions">
            <button
              title="编辑这份人格文件 SOUL.md（首次自动生成模板，保存即生效）。人格只影响表达风格，访客安全护栏始终优先。"
              onClick={() => node && onEditSoul(node.id)}
            >
              🎭 编辑灵魂 (SOUL.md)
            </button>
          </div>
        </>
      )}
      {node.type === "webhook" && (
        <>
          <div className="hint" style={{ marginBottom: 6 }}>
            外部系统（Jenkins/CI/GitHub）POST 到下面这个地址即触发；把它连到一个「Claude 会话」节点。
          </div>
          <div className="base-session">
            <div className="base-session-title">回调地址（POST · 同网段可达）</div>
            <div className="owner-row">
              <span className="owner-id" title={`http://<本机IP>:8921/hook/${d.token ?? ""}`}>
                http://&lt;本机IP&gt;:8921/hook/{d.token ?? ""}
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(`/hook/${d.token ?? ""}`).catch(() => {})}
                title="复制路径"
              >
                复制
              </button>
            </div>
          </div>
          {field("指令模板（{{body}}=请求体）", d.prompt, "prompt")}
          {field("投递群 chatId", d.chatId, "chatId")}
          <div className="hint" style={{ marginBottom: 6 }}>
            留空 = 发到 Home Chat。外网回调需自建隧道（cloudflared/ngrok 指向 8921）。
          </div>
          <label className="field">
            <span>启用</span>
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
          {field("触发时刻", d.schedule, "schedule")}
          <div className="hint" style={{ marginBottom: 6 }}>
            支持：<code>09:00</code>(每天) · <code>every 30m</code> / <code>every 2h</code>(间隔)
          </div>
          {field("指令 prompt", d.prompt, "prompt")}
          {field("投递群 chatId", d.chatId, "chatId")}
          <div className="hint" style={{ marginBottom: 6 }}>
            留空 = 发到 Home Chat（在「飞书连接」面板设置）；连线到一个「Claude 会话」节点即生效
          </div>
          <label className="field">
            <span>启用</span>
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
          {field("分类模型(可空=haiku)", d.model, "model")}
          <label className="field">
            <span>判定模式</span>
            <select value={d.mode ?? "best"} onChange={(e) => onPatch({ mode: e.target.value })}>
              <option value="best">最佳匹配</option>
              <option value="priority">优先级(连线顺序)</option>
            </select>
          </label>
          <div className="hint">
            从该节点右侧拉多条线到不同会话，点每条线设「触发意图」；留空的线=默认边。
          </div>
        </>
      )}
      {node.type === "claude-session" && (
        <>
          {field("工作目录 cwd", d.cwd, "cwd")}
          {field("模型(可空)", d.model, "model")}
          <label className="field">
            <span>主人权限(你@时)</span>
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
            <span>访客权限(他人@时)</span>
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
          {field("追加 system prompt", d.appendSystemPrompt, "appendSystemPrompt")}
          <label className="field">
            <span>敏感操作飞书审批</span>
            <input
              type="checkbox"
              checked={!!d.approvalMode}
              title="工具调用需要授权时，向来源群发卡片由主人[允许/拒绝]（需 permissionMode=default 才会询问）"
              onChange={(e) => onPatch({ approvalMode: e.target.checked })}
            />
          </label>

          <div className="fs-actions">
            <button
              className="ghost"
              title="本会话的内联人格 SOUL.md——仅当没有「🎭 人格节点」连到此会话的人格口时才回退生效。推荐：建一个人格节点连到会话单独管理（可共享给多个会话）。"
              onClick={() => node && onEditSoul(node.id)}
            >
              🎭 内联人格（回退·未接人格节点时）
            </button>
          </div>

          <div className="base-session">
            <div className="base-session-title">基础会话 (fork 来源，如「角色管线」会话)</div>
            <div className="field">
              <span>baseSessionId</span>
              <input
                value={d.baseSessionId ?? ""}
                placeholder="留空=普通会话；填入则首次 fork 一份知识底座"
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
                {showPicker ? "收起列表" : "列出该目录的会话…"}
              </button>
              {d.baseSessionId && (
                <button
                  className="ghost"
                  title="立即从基础会话重新 fork 访客会话并脱敏(抹掉密钥)，吸收最新开发内容"
                  onClick={() => node && onRefreshSnapshot(node.id)}
                >
                  刷新快照(脱敏)
                </button>
              )}
            </div>
            {showPicker && (
              <input
                className="pick-filter"
                value={pickFilter}
                placeholder="粘贴 sessionId 或关键词搜索…"
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
                    <div className="si-preview">{s.preview || "(无预览)"}</div>
                    <div className="si-meta">
                      {new Date(s.mtime).toLocaleString()} · {(s.sizeBytes / 1024).toFixed(0)}KB ·{" "}
                      {s.id.slice(0, 8)}…
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showPicker && sessions.length === 0 && (
              <div className="fs-detail">该目录暂无会话（确认 cwd 正确、且在该目录跑过 claude）</div>
            )}
            {showPicker &&
              pickFilter &&
              sessions.length > 0 &&
              !sessions.some(
                (s) => s.id.includes(pickFilter) || (s.preview || "").includes(pickFilter),
              ) && (
                <div className="fs-detail">
                  无匹配。确认该 sessionId 属于此 cwd 目录；也可直接把 ID 粘到上面的 baseSessionId。
                </div>
              )}
          </div>

          <div className="hint">
            运行会话 sid: {d.sessionId ? d.sessionId : d.baseSessionId ? "首次 fork 后生成" : "首次运行生成"}
          </div>

          <div className="sec-summary" title="本会话的安全态势（脱敏 fork / 出站脱敏 / 护栏 / 权限分级）">
            <div className="sec-title">🛡 安全态势</div>
            <div className={`sec-item ${d.baseSessionId ? "on" : "off"}`}>
              {d.baseSessionId ? "✓" : "—"} 访客走脱敏 fork（开发会话只读不被污染）
            </div>
            <div className="sec-item on">✓ 访客回复出站二次脱敏 + 安全护栏</div>
            <div className={`sec-item ${d.approvalMode ? "on" : "off"}`}>
              {d.approvalMode ? "✓" : "—"} 敏感操作飞书审批{d.approvalMode ? "" : "（未开）"}
            </div>
            <div className="sec-item dim">
              主人权限 {d.permissionMode} · 访客权限 {d.guestPermissionMode ?? "default"}
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
