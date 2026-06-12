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

interface Props {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeClick: NodeMouseHandler;
  onNodeDoubleClick: NodeMouseHandler;
  onEdgeClick: EdgeMouseHandler;
  /** 点连线上的"意图徽标"时打开条件编辑 */
  onEditEdge: (id: string) => void;
  /** 点连线 hover 出现的「×」一键删除连线 */
  onDeleteEdge: (id: string) => void;
  onPaneClick: () => void;
  onNodeContextMenu: NodeMouseHandler;
  onEdgeContextMenu: EdgeMouseHandler;
  onPaneContextMenu: (e: MouseEvent | ReactMouseEvent) => void;
  /** 拖动时的对齐参考线坐标（画布坐标系），无对齐则两者为 undefined */
  helperLines?: { horizontal?: number; vertical?: number };
}

const edgeTypes = { default: ConditionEdge };

// 劲道连线：贝塞尔曲线但收紧曲率(0.5)——出入口方向感强、中段绷直不软塌，配箭头收尾。
// pathOptions 会被 ReactFlow 浅合并进每条边、由 BezierEdge 读取；类型定义没收录故断言。
const defaultEdgeOptions = {
  type: "default",
  pathOptions: { curvature: 0.5 },
  style: { stroke: "#5d7290", strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: "#5d7290" },
} as unknown as DefaultEdgeOptions;

// 各类节点的代表色（与节点卡左侧色条一致），用于右下角缩略图上色
const NODE_COLORS: Record<string, string> = {
  "feishu-group": "#00b386",
  route: "#c08cff",
  "intent-switch": "#ffb84d",
  "claude-session": "#4f8cff",
  cron: "#39c5cf",
  webhook: "#e0b13e",
  soul: "#b083f0",
};
const miniMapNodeColor = (node: Node) => NODE_COLORS[node.type ?? ""] ?? "#3a4250";

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

  return (
    <EdgeActionContext.Provider value={{ editEdge: props.onEditEdge, deleteEdge: props.onDeleteEdge }}>
    <ReactFlow
      nodes={props.nodes}
      edges={props.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={props.onNodesChange}
      onEdgesChange={props.onEdgesChange}
      onConnect={props.onConnect}
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
      colorMode="dark"
      deleteKeyCode={["Delete", "Backspace"]}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#2c323d" />
      <HelperLines horizontal={props.helperLines?.horizontal} vertical={props.helperLines?.vertical} />
      <Controls />
      <MiniMap
        pannable
        zoomable
        nodeColor={miniMapNodeColor}
        nodeStrokeColor={miniMapNodeColor}
        nodeStrokeWidth={3}
        nodeBorderRadius={3}
        maskColor="rgba(0,0,0,0.6)"
        style={{ backgroundColor: "#1b1e24" }}
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
        </div>
      )}
    </ReactFlow>
    </EdgeActionContext.Provider>
  );
}
