import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row } from "./NodeShell.js";

export function FeishuGroupNode({ data, selected }: NodeProps) {
  const d = data as { label: string; chatId: string; triggerMode: string };
  return (
    <NodeShell kind="feishu" icon="💬" label={d.label || "飞书群"} selected={selected} hasTarget={false}>
      <Row k="chatId" v={d.chatId ? `…${d.chatId.slice(-12)}` : "(未设置)"} dim={!d.chatId} />
      <Row k="触发" v={d.triggerMode === "all" ? "全部消息" : "@机器人"} />
    </NodeShell>
  );
}
