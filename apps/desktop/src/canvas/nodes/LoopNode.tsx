import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row } from "./NodeShell.js";
import { useT } from "../../i18n/index.js";

export function LoopNode({ data, selected }: NodeProps) {
  const t = useT();
  const d = data as {
    label: string;
    schedule?: string;
    prompt?: string;
    stopMode?: string;
    maxRounds?: number;
    chatId?: string;
    enabled?: boolean;
  };
  const task = d.prompt ? (d.prompt.length > 22 ? d.prompt.slice(0, 22) + "…" : d.prompt) : t("(未设置)");
  return (
    <NodeShell kind="loop" icon="🔁" label={d.label || t("循环")} selected={selected} hasTarget={false}>
      <Row k={t("触发")} v={d.schedule ? d.schedule : t("手动")} dim={!d.schedule} />
      <Row k={t("任务")} v={task} dim={!d.prompt} title={d.prompt && d.prompt.length > 22 ? d.prompt : undefined} />
      <Row
        k={t("停止")}
        v={`${d.stopMode === "count" ? t("满轮数") : t("完成标记")} · ≤${d.maxRounds ?? 5}${t("轮")}`}
      />
      <Row k={t("投递")} v={d.chatId ? `…${d.chatId.slice(-10)}` : "Home Chat"} title={d.chatId || undefined} />
      {d.enabled === false ? <Row k="" v={t("⏸ 已停用")} dim /> : null}
    </NodeShell>
  );
}
