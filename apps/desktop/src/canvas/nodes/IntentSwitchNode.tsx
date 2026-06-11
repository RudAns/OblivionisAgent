import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row } from "./NodeShell.js";

export function IntentSwitchNode({ data, selected }: NodeProps) {
  const d = data as { label: string; model?: string; mode?: string };
  return (
    <NodeShell kind="intent" icon="🧠" label={d.label || "意图分流"} selected={selected}>
      <Row k="模型" v={d.model || "haiku"} />
      <Row k="模式" v={d.mode === "priority" ? "优先级(顺序)" : "最佳匹配"} />
      <Row k="" v="右侧拉多条线，每条设意图" dim />
    </NodeShell>
  );
}
