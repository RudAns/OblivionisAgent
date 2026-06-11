import { Handle, Position } from "@xyflow/react";
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
  const isFork = !!d.baseSessionId; // 有 base = 双会话模型：base=终端、fork=飞书分身
  return (
    <NodeShell
      kind="claude"
      icon="🤖"
      label={d.label || "Claude 会话"}
      selected={selected}
      status={d.status ?? "idle"}
      hasSource={false}
    >
      {/* 人格连接口：Soul 节点拖到这里，作用于该会话的飞书回复(fork 脱敏分身)。
          终端(base)注入人格已评估为不需要，故只留单个口 */}
      <Handle type="target" id="fork" position={Position.Top} className="soul-port" style={{ left: "50%" }} />
      <span className="soul-port-label" style={{ left: "50%" }}>🎭人格</span>

      <Row k="cwd" v={tailTruncate(d.cwd) || "(未设置)"} dim={!d.cwd} />
      <Row k="模型" v={d.model || "默认"} />
      <Row k="权限" v={`${d.permissionMode} / ${d.guestPermissionMode ?? "default"}`} />
      {/* 原始(终端)会话 */}
      <Row k="🖥️原始" v={isFork ? d.baseSessionId!.slice(0, 8) + "… (终端)" : "首次运行生成"} dim={!isFork} />
      {/* Fork 脱敏分身：飞书走这条（只读快照，刷新在右侧面板） */}
      <div className="session-fork-strip">
        <span className="sfs-tag">脱敏分身</span>
        <span className="sfs-sid">
          {d.sessionId ? "sid " + d.sessionId.slice(0, 8) + "…" : isFork ? "首次访客消息时生成" : "首次运行生成"}
        </span>
        <span className="sfs-note">飞书走这条</span>
      </div>
    </NodeShell>
  );
}
