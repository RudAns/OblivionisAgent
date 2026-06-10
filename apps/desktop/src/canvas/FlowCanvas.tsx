import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ConnectionLineType,
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

// 柔性贝塞尔曲线（"default" = bezier），比 smoothstep 的直角折线更顺眼
const defaultEdgeOptions: DefaultEdgeOptions = {
  type: "default",
  style: { stroke: "#5a6b8c", strokeWidth: 2 },
};

// 各类节点的代表色（与节点卡左侧色条一致），用于右下角缩略图上色
const NODE_COLORS: Record<string, string> = {
  "feishu-group": "#00b386",
  route: "#c08cff",
  "intent-switch": "#ffb84d",
  "claude-session": "#4f8cff",
};
const miniMapNodeColor = (node: Node) => NODE_COLORS[node.type ?? ""] ?? "#3a4250";

export function FlowCanvas(props: Props) {
  const nodeTypes = useMemo(
    () => ({
      "feishu-group": FeishuGroupNode,
      route: RouteNode,
      "intent-switch": IntentSwitchNode,
      "claude-session": ClaudeSessionNode,
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
