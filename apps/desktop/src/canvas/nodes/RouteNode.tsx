import { Handle, Position, type NodeProps } from "@xyflow/react";

export function RouteNode({ data, selected }: NodeProps) {
  const d = data as { label: string; stripMention: boolean; prefix?: string };
  return (
    <div className={`node node-route ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-title">🔀 路由</div>
      <div className="node-label">{d.label}</div>
      <div className="node-field">去@: {d.stripMention ? "是" : "否"}</div>
      {d.prefix ? <div className="node-field">前缀: {d.prefix}</div> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
