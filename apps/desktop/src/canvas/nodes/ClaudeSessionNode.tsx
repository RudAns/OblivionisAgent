import { Handle, Position, type NodeProps } from "@xyflow/react";

const STATUS_LABEL: Record<string, string> = {
  idle: "● 空闲",
  running: "● 运行中",
  error: "● 出错",
};

export function ClaudeSessionNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string;
    cwd: string;
    model?: string;
    permissionMode: string;
    sessionId?: string;
    status?: string;
  };
  const status = d.status ?? "idle";
  return (
    <div className={`node node-claude ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-title">
        🤖 Claude 会话 <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="node-label">{d.label}</div>
      <div className="node-field">cwd: {d.cwd || "(未设置)"}</div>
      <div className="node-field">模型: {d.model || "默认"}</div>
      <div className="node-field">权限: {d.permissionMode}</div>
      {d.sessionId ? (
        <div className="node-field">sid: {d.sessionId.slice(0, 8)}…</div>
      ) : (
        <div className="node-field dim">sid: 首次运行时生成</div>
      )}
    </div>
  );
}
