import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row } from "./NodeShell.js";
import { useT } from "../../i18n/index.js";

export function FeishuGroupNode({ data, selected }: NodeProps) {
  const t = useT();
  const d = data as { label: string; chatId: string; triggerMode: string };
  return (
    <NodeShell kind="feishu" icon="💬" label={d.label || t("飞书群")} selected={selected} hasTarget={false}>
      <Row k="chatId" v={d.chatId ? `…${d.chatId.slice(-12)}` : t("(未设置)")} dim={!d.chatId} title={d.chatId || undefined} />
      <Row k={t("触发")} v={d.triggerMode === "all" ? t("全部消息") : t("@机器人")} />
    </NodeShell>
  );
}
