import { Handle, Position, type NodeProps } from "@xyflow/react";

export function FeishuGroupNode({ data, selected }: NodeProps) {
  const d = data as { label: string; chatId: string; triggerMode: string };
  return (
    <div className={`node node-feishu ${selected ? "selected" : ""}`}>
      <div className="node-title">💬 飞书群</div>
      <div className="node-label">{d.label}</div>
      <div className="node-field">chatId: {d.chatId || "(未设置)"}</div>
      <div className="node-field">触发: {d.triggerMode}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
