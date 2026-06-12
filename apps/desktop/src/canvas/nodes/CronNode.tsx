import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row } from "./NodeShell.js";

export function CronNode({ data, selected }: NodeProps) {
  const d = data as { label: string; schedule?: string; prompt?: string; chatId?: string; enabled?: boolean };
  return (
    <NodeShell kind="cron" icon="⏰" label={d.label || "定时任务"} selected={selected} hasTarget={false}>
      <Row k="时刻" v={d.schedule || "(未设置)"} dim={!d.schedule} />
      <Row
        k="指令"
        v={d.prompt ? (d.prompt.length > 22 ? d.prompt.slice(0, 22) + "…" : d.prompt) : "(未设置)"}
        dim={!d.prompt}
        title={d.prompt && d.prompt.length > 22 ? d.prompt : undefined}
      />
      <Row k="投递" v={d.chatId ? `…${d.chatId.slice(-10)}` : "Home Chat"} title={d.chatId || undefined} />
      {d.enabled === false ? <Row k="" v="⏸ 已停用" dim /> : null}
    </NodeShell>
  );
}
