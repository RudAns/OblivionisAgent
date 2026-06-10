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
} from "@oblivionis/shared";
import { BridgeClient } from "./bridge-client.js";
import { FlowCanvas } from "./canvas/FlowCanvas.js";
import { TranscriptPanel } from "./panels/TranscriptPanel.js";
import { TerminalsHost, type TermInfo } from "./panels/TerminalsHost.js";
import { type LogLine } from "./panels/LogPanel.js";
import { AuditPanel, type AuditItem } from "./panels/AuditPanel.js";
import { FeishuPanel, FeishuStatusDot, type FeishuState } from "./panels/FeishuPanel.js";

type Tab = "transcript" | "terminal" | "audit" | "feishu";

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
  const [inspectorOpen, setInspectorOpen] = useState(true);
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
    try {
      localStorage.setItem("oblivionis.canvasCollapsed", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);
  const [openedTerminals, setOpenedTerminals] = useState<string[]>([]); // 已打开(保活)的会话节点 id
  const [activeTerminal, setActiveTerminal] = useState<string | null>(null); // 当前显示的终端(独立状态)
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
      }
    });
    return () => {
      off();
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

  // 拖动右侧分隔条调整面板宽度（让终端可拉宽）
  const startResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: globalThis.MouseEvent) =>
      setPanelWidth(Math.min(1100, Math.max(280, startW + (startX - ev.clientX))));
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

  /** 删除选中的节点及其连线（记得点保存才会同步给引擎） */
  const deleteSelected = () => {
    if (!selected) return;
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

  return (
    <div className="app">
      <header className="toolbar">
        <strong>OblivionisAgent</strong>
        <button
          className={`fs-chip ${feishuOpen ? "on" : ""}`}
          onClick={() => setFeishuOpen((o) => !o)}
          title="飞书连接（点开/收起）"
        >
          <FeishuStatusDot status={feishu.status} />
          飞书{feishu.bot?.name ? `：${feishu.bot.name}` : ""}
        </button>
        {selectedNode && !inspectorOpen && (
          <button onClick={() => setInspectorOpen(true)} title="显示节点编辑">
            ✎ 编辑节点
          </button>
        )}
        <div className="spacer" />
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

      <div className={`main ${canvasCollapsed ? "collapsed" : ""}`}>
        {canvasCollapsed ? (
          <div className="rail">
            <div className="rail-head">
              <span className="rail-title">会话</span>
              <button
                className="rail-toggle"
                title="展开连线画布"
                onClick={() => setCanvasCollapsed(false)}
              >
                »
              </button>
            </div>
            <div className="rail-list">
              {claudeNodes.length === 0 && (
                <div className="rail-empty">还没有 Claude 会话节点</div>
              )}
              {claudeNodes.map((n) => {
                const d = n.data as { label?: string; cwd?: string; status?: string };
                const open = openedTerminals.includes(n.id);
                return (
                  <div
                    key={n.id}
                    className={`rail-card ${selected === n.id ? "sel" : ""} ${
                      activeTerminalId === n.id ? "active" : ""
                    }`}
                    title={`${d.cwd || ""}\n单击=选择(看转录·访客会话) · 双击=打开开发终端`}
                    onClick={() => {
                      setSelected(n.id);
                      setTab("transcript");
                    }}
                    onDoubleClick={() => openTerminalForNode(n.id)}
                  >
                    <div className="rail-card-top">
                      <span className={`rail-dot status-${d.status ?? "idle"}`} />
                      <span className="rail-label">{d.label || "会话"}</span>
                      {open && (
                        <span className="rail-open" title="终端已打开">
                          ▮
                        </span>
                      )}
                    </div>
                    <div className="rail-cwd">{d.cwd || "(未设置工作区)"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
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

          {/* 浮窗：节点编辑（左上，可隐藏） */}
          {inspectorOpen && selectedNode && (
            <div className="popup popup-inspector">
              <div className="popup-head">
                <span>节点编辑</span>
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

          {/* 浮窗：飞书连接（可隐藏，不常用） */}
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
                />
              </div>
            </div>
          )}
          {/* 画板浮动工具条：加节点（从顶栏移入；画板折叠时自然隐藏） */}
          <div className="canvas-palette">
            <span className="hint">改动自动保存</span>
            <button onClick={() => addNode("feishu-group")}>+ 飞书群</button>
            <button onClick={() => addNode("route")}>+ 路由</button>
            <button onClick={() => addNode("intent-switch")}>+ 意图分流</button>
            <button onClick={() => addNode("claude-session")}>+ Claude 会话</button>
          </div>
          <button
            className="canvas-collapse"
            title="收起连线画布（左侧保留会话卡片菜单）"
            onClick={() => setCanvasCollapsed(true)}
          >
            «
          </button>
          </div>
        )}

        {!canvasCollapsed && (
          <div className="resizer" onMouseDown={startResize} title="拖动调整宽度" />
        )}

        <aside className="side" style={canvasCollapsed ? { flex: 1, minWidth: 0 } : { width: panelWidth }}>
          <div className="tabs">
            <button className={tab === "transcript" ? "on" : ""} onClick={() => setTab("transcript")}>
              转录·访客会话
            </button>
            <button className={tab === "terminal" ? "on" : ""} onClick={() => setTab("terminal")}>
              终端·开发会话
            </button>
            <button className={tab === "audit" ? "on" : ""} onClick={() => setTab("audit")}>
              审计
            </button>
          </div>

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
          </div>
        </aside>
      </div>
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
}: {
  node: Node | null;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  sessions: SessionInfo[];
  onListSessions: (cwd: string) => void;
  onRefreshSnapshot: (nodeId: string) => void;
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
