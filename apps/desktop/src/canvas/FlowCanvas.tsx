import { useCallback, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ConnectionLineType,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnConnectEnd,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type DefaultEdgeOptions,
  type IsValidConnection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FeishuGroupNode } from "./nodes/FeishuGroupNode.js";
import { RouteNode } from "./nodes/RouteNode.js";
import { IntentSwitchNode } from "./nodes/IntentSwitchNode.js";
import { ClaudeSessionNode } from "./nodes/ClaudeSessionNode.js";
import { CronNode } from "./nodes/CronNode.js";
import { WebhookNode } from "./nodes/WebhookNode.js";
import { SoulNode } from "./nodes/SoulNode.js";
import { ConditionEdge } from "./edges/ConditionEdge.js";
import { HelperLines } from "./HelperLines.js";
import { EdgeActionContext } from "./edge-context.js";
import { EdgeRuntimeContext } from "./edge-runtime-context.js";
import { NodeMetaContext } from "./node-meta-context.js";
import { NodeActionContext } from "./node-action-context.js";

interface Props {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  /** 拖线松手：落空白处时由 App 弹「可连类型」菜单 */
  onConnectEnd: OnConnectEnd;
  onNodeClick: NodeMouseHandler;
  onNodeDoubleClick: NodeMouseHandler;
  onEdgeClick: EdgeMouseHandler;
  /** 点连线上的"意图徽标"时打开条件编辑 */
  onEditEdge: (id: string) => void;
  /** 点连线 hover 出现的「×」一键删除连线 */
  onDeleteEdge: (id: string) => void;
  /** 节点 hover 出现的「⎘」复制单个节点 */
  onCopyNode: (id: string) => void;
  /** 节点 hover 出现的「🗑」删除节点(连同其连线) */
  onDeleteNode: (id: string) => void;
  onPaneClick: () => void;
  onNodeContextMenu: NodeMouseHandler;
  onEdgeContextMenu: EdgeMouseHandler;
  onPaneContextMenu: (e: MouseEvent | ReactMouseEvent) => void;
  /** 拖动时的对齐参考线坐标（画布坐标系），无对齐则两者为 undefined */
  helperLines?: { horizontal?: number; vertical?: number };
  /** 运行时高亮的连线 id 集合（流线动画） */
  activeEdges: Set<string>;
  /** 选中节点的上下游链路连线集合(其它连线降透明度)；null=未聚焦 */
  focusEdges: Set<string> | null;
  /** 当前明暗主题：驱动 React Flow colorMode 与背景点/缩略图配色 */
  theme: "dark" | "light";
  /** 各会话节点 transcript 最终修改时间，供节点卡显示日期 */
  nodeMetas: Record<string, { base?: number; fork?: number }>;
}

const edgeTypes = { default: ConditionEdge };

// 连线静息色：深色画布用低饱和蓝灰(#7186A3)，浅色画布上它太淡 → 用更深的板岩蓝(#46566F)，
// 默认就清晰、不必 hover 才显形。随主题切换由 useMemo 重算(连箭头一起变色)。
const REST_EDGE = { dark: "#7186a3", light: "#46566f" } as const;

// 各类节点的代表色(美术稿)：输入绿/意图琥珀/路由紫/Claude 珊瑚橙。图标/顶部细条/边框/缩略图共用
const NODE_COLORS: Record<string, string> = {
  "feishu-group": "#3b9b70",
  route: "#8167b2",
  "intent-switch": "#c68a32",
  "claude-session": "#d96745",
  cron: "#3a8fa0",
  webhook: "#b7791f",
  soul: "#8167b2",
};
// 缩略图用各节点代表色（选中再描品牌色圈），这样一眼分得清哪个是哪个
const miniMapNodeColor = (node: Node) => NODE_COLORS[node.type ?? ""] ?? "#9aa3b2";
const miniMapStroke = (node: Node) => (node.selected ? "#d96745" : NODE_COLORS[node.type ?? ""] ?? "#9aa3b2");

// 合法连线语法（像专业节点编辑器一样，连错当场拒绝）：
//   群/路由/分流/定时/Webhook → 路由/分流/会话（cron/webhook 只直连会话）
//   人格(soul) → 会话的「人格口」(targetHandle=fork)；人格口也只接 soul
const ROUTING_SRC = new Set(["feishu-group", "route", "intent-switch", "cron", "webhook"]);
const ROUTING_TGT = new Set(["route", "intent-switch", "claude-session"]);

export function FlowCanvas(props: Props) {
  const nodeTypes = useMemo(
    () => ({
      "feishu-group": FeishuGroupNode,
      route: RouteNode,
      "intent-switch": IntentSwitchNode,
      "claude-session": ClaudeSessionNode,
      cron: CronNode,
      webhook: WebhookNode,
      soul: SoulNode,
    }),
    [],
  );

  const kindById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of props.nodes) m.set(n.id, n.type ?? "");
    return m;
  }, [props.nodes]);

  const isValidConnection = useCallback<IsValidConnection>(
    (c: Connection | Edge) => {
      const sk = kindById.get(c.source ?? "");
      const tk = kindById.get(c.target ?? "");
      if (!sk || !tk || c.source === c.target) return false;
      if (sk === "soul") return tk === "claude-session" && c.targetHandle === "fork"; // 人格只连人格口
      if (c.targetHandle === "fork") return false; // 人格口只接 soul（上面已放行）
      if (!ROUTING_SRC.has(sk) || !ROUTING_TGT.has(tk)) return false;
      if ((sk === "cron" || sk === "webhook") && tk !== "claude-session") return false; // 触发节点只直连会话
      return true;
    },
    [kindById],
  );

  // 连线默认样式随主题变色（静息就深、清晰），曲率 0.5 收紧出入口方向感
  const defaultEdgeOptions = useMemo(() => {
    const c = REST_EDGE[props.theme];
    return {
      type: "default",
      pathOptions: { curvature: 0.5 },
      style: { stroke: c, strokeWidth: 1.8 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: c },
    } as unknown as DefaultEdgeOptions;
  }, [props.theme]);

  const runtimeValue = useMemo(
    () => ({ activeEdges: props.activeEdges, focusEdges: props.focusEdges, theme: props.theme }),
    [props.activeEdges, props.focusEdges, props.theme],
  );
  const metaValue = useMemo(() => ({ metas: props.nodeMetas }), [props.nodeMetas]);
  const actionValue = useMemo(
    () => ({ copyNode: props.onCopyNode, deleteNode: props.onDeleteNode }),
    [props.onCopyNode, props.onDeleteNode],
  );

  return (
    <EdgeActionContext.Provider value={{ editEdge: props.onEditEdge, deleteEdge: props.onDeleteEdge }}>
    <EdgeRuntimeContext.Provider value={runtimeValue}>
    <NodeActionContext.Provider value={actionValue}>
    <NodeMetaContext.Provider value={metaValue}>
    <ReactFlow
      nodes={props.nodes}
      edges={props.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={props.onNodesChange}
      onEdgesChange={props.onEdgesChange}
      onConnect={props.onConnect}
      onConnectEnd={props.onConnectEnd}
      isValidConnection={isValidConnection}
      onNodeClick={props.onNodeClick}
      onNodeDoubleClick={props.onNodeDoubleClick}
      onEdgeClick={props.onEdgeClick}
      onPaneClick={props.onPaneClick}
      onNodeContextMenu={props.onNodeContextMenu}
      onEdgeContextMenu={props.onEdgeContextMenu}
      onPaneContextMenu={props.onPaneContextMenu}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineType={ConnectionLineType.Bezier}
      colorMode={props.theme}
      deleteKeyCode={["Delete"]}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={22}
        size={1.4}
        color={props.theme === "light" ? "#e4e0d8" : "#2c323d"}
      />
      <HelperLines horizontal={props.helperLines?.horizontal} vertical={props.helperLines?.vertical} />
      {/* 右下角控制条：− / + / 适应视图，做成干净的横向白条(去掉交互锁；缩放百分比指示器已撤) */}
      <Controls position="bottom-right" showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={miniMapNodeColor}
        nodeStrokeColor={miniMapStroke}
        nodeStrokeWidth={2}
        nodeBorderRadius={2}
        maskColor={props.theme === "light" ? "rgba(214,210,200,0.28)" : "rgba(0,0,0,0.55)"}
        maskStrokeColor="#d96745"
        maskStrokeWidth={props.theme === "light" ? 2.5 : 2}
        style={{ width: 150, height: 104, backgroundColor: props.theme === "light" ? "#ffffff" : "#1b1e24" }}
      />
      {props.nodes.length === 0 && (
        <div className="canvas-empty-guide">
          <div className="ceg-title">空画布 · 开始搭一条链路</div>
          <div className="ceg-body">从上方 <b>＋ 工具条</b> 建节点。典型搭法:</div>
          <div className="ceg-flow">
            <span className="ceg-chip fg">飞书群</span>
            <span className="ceg-arrow">→</span>
            <span className="ceg-chip rt">路由</span>
            <span className="ceg-arrow">→</span>
            <span className="ceg-chip cs">Claude 会话</span>
          </div>
          <div className="ceg-hint">连好后，在飞书群 @机器人 即可对话。连线会自动校验，连错会被拒绝。</div>
          <div className="ceg-hint">提示：按住 Shift 点选 / 框选多个节点可批量对齐分布 · 右键空白处或 Ctrl+K 快速加节点。</div>
        </div>
      )}
    </ReactFlow>
    </NodeMetaContext.Provider>
    </NodeActionContext.Provider>
    </EdgeRuntimeContext.Provider>
    </EdgeActionContext.Provider>
  );
}
