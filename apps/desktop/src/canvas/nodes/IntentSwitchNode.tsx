import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row } from "./NodeShell.js";
import { useT } from "../../i18n/index.js";

export function IntentSwitchNode({ data, selected }: NodeProps) {
  const t = useT();
  const d = data as { label: string; model?: string; mode?: string };
  return (
    <NodeShell kind="intent" icon="🧠" label={d.label || t("意图分流")} selected={selected}>
      <Row k={t("模型")} v={d.model || "haiku"} />
      <Row k={t("模式")} v={d.mode === "priority" ? t("优先级(顺序)") : t("最佳匹配")} />
      <Row k="" v={t("右侧拉多条线，每条设意图")} dim />
    </NodeShell>
  );
}
