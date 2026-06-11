import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row, tailTruncate } from "./NodeShell.js";

export function ClaudeSessionNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string;
    cwd: string;
    model?: string;
    permissionMode: string;
    guestPermissionMode?: string;
    sessionId?: string;
    baseSessionId?: string;
    status?: string;
  };
  return (
    <NodeShell
      kind="claude"
      icon="🤖"
      label={d.label || "Claude 会话"}
      selected={selected}
      status={d.status ?? "idle"}
      hasSource={false}
    >
      <Row k="cwd" v={tailTruncate(d.cwd) || "(未设置)"} dim={!d.cwd} />
      <Row k="模型" v={d.model || "默认"} />
      <Row k="权限" v={`${d.permissionMode} / ${d.guestPermissionMode ?? "default"}`} />
      {d.baseSessionId ? <Row k="base" v={d.baseSessionId.slice(0, 8) + "…"} /> : null}
      {d.sessionId ? (
        <Row k="fork" v={d.sessionId.slice(0, 8) + "…"} />
      ) : (
        <Row k="fork" v={d.baseSessionId ? "首次访客消息时生成" : "首次运行生成"} dim />
      )}
    </NodeShell>
  );
}
