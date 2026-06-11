import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row } from "./NodeShell.js";

export function RouteNode({ data, selected }: NodeProps) {
  const d = data as { label: string; stripMention: boolean; prefix?: string };
  return (
    <NodeShell kind="route" icon="🔀" label={d.label || "路由"} selected={selected}>
      <Row k="去@" v={d.stripMention ? "是" : "否"} />
      {d.prefix ? (
        <Row k="前缀" v={d.prefix.length > 22 ? d.prefix.slice(0, 22) + "…" : d.prefix} />
      ) : null}
    </NodeShell>
  );
}
