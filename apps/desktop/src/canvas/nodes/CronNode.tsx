import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row } from "./NodeShell.js";
import { useT } from "../../i18n/index.js";

export function CronNode({ data, selected }: NodeProps) {
  const t = useT();
  const d = data as { label: string; schedule?: string; prompt?: string; chatId?: string; enabled?: boolean };
  return (
    <NodeShell kind="cron" icon="⏰" label={d.label || t("定时任务")} selected={selected} hasTarget={false}>
      <Row k={t("时刻")} v={d.schedule || t("(未设置)")} dim={!d.schedule} />
      <Row
        k={t("指令")}
        v={d.prompt ? (d.prompt.length > 22 ? d.prompt.slice(0, 22) + "…" : d.prompt) : t("(未设置)")}
        dim={!d.prompt}
        title={d.prompt && d.prompt.length > 22 ? d.prompt : undefined}
      />
      <Row k={t("投递")} v={d.chatId ? `…${d.chatId.slice(-10)}` : "Home Chat"} title={d.chatId || undefined} />
      {d.enabled === false ? <Row k="" v={t("⏸ 已停用")} dim /> : null}
    </NodeShell>
  );
}
