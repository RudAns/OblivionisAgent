import { Handle, Position, type NodeProps } from "@xyflow/react";

export function IntentSwitchNode({ data, selected }: NodeProps) {
  const d = data as { label: string; model?: string; mode?: string };
  return (
    <div className={`node node-intent ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-title">🧠 意图分流</div>
      <div className="node-label">{d.label}</div>
      <div className="node-field">模型: {d.model || "haiku"}</div>
      <div className="node-field">模式: {d.mode === "priority" ? "优先级(顺序)" : "最佳匹配"}</div>
      <div className="node-field dim">从右侧拉多条线，每条设触发意图</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
