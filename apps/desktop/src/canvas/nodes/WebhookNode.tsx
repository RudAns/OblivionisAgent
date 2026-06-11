import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row } from "./NodeShell.js";

export function WebhookNode({ data, selected }: NodeProps) {
  const d = data as { label: string; token?: string; prompt?: string; chatId?: string; enabled?: boolean };
  return (
    <NodeShell kind="webhook" icon="🪝" label={d.label || "Webhook"} selected={selected} hasTarget={false}>
      <Row k="路径" v={d.token ? `/hook/${d.token.slice(0, 8)}…` : "(未生成)"} dim={!d.token} />
      <Row k="投递" v={d.chatId ? `…${d.chatId.slice(-10)}` : "Home Chat"} />
      {d.enabled === false ? <Row k="" v="⏸ 已停用" dim /> : null}
    </NodeShell>
  );
}
