import { useMemo } from "react";
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
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type DefaultEdgeOptions,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FeishuGroupNode } from "./nodes/FeishuGroupNode.js";
import { RouteNode } from "./nodes/RouteNode.js";
import { IntentSwitchNode } from "./nodes/IntentSwitchNode.js";
import { ClaudeSessionNode } from "./nodes/ClaudeSessionNode.js";
import { CronNode } from "./nodes/CronNode.js";
import { WebhookNode } from "./nodes/WebhookNode.js";

interface Props {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeClick: NodeMouseHandler;
  onNodeDoubleClick: NodeMouseHandler;
  onEdgeClick: EdgeMouseHandler;
  onPaneClick: () => void;
}

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
};
const miniMapNodeColor = (node: Node) => NODE_COLORS[node.type ?? ""] ?? "#3a4250";

export function FlowCanvas(props: Props) {
  const nodeTypes = useMemo(
    () => ({
      "feishu-group": FeishuGroupNode,
      route: RouteNode,
      "intent-switch": IntentSwitchNode,
      "claude-session": ClaudeSessionNode,
      cron: CronNode,
      webhook: WebhookNode,
    }),
    [],
  );

  return (
    <ReactFlow
      nodes={props.nodes}
      edges={props.edges}
      nodeTypes={nodeTypes}
      onNodesChange={props.onNodesChange}
      onEdgesChange={props.onEdgesChange}
      onConnect={props.onConnect}
      onNodeClick={props.onNodeClick}
      onNodeDoubleClick={props.onNodeDoubleClick}
      onEdgeClick={props.onEdgeClick}
      onPaneClick={props.onPaneClick}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineType={ConnectionLineType.Bezier}
      colorMode="dark"
      deleteKeyCode={["Delete", "Backspace"]}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#2c323d" />
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
    </ReactFlow>
  );
}
