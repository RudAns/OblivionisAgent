import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row } from "./NodeShell.js";

export function RouteNode({ data, selected }: NodeProps) {
  const d = data as { label: string; prefix?: string };
  return (
    <NodeShell kind="route" icon="🔀" label={d.label || "路由"} selected={selected}>
      {d.prefix ? (
        <Row k="前缀" v={d.prefix.length > 22 ? d.prefix.slice(0, 22) + "…" : d.prefix} />
      ) : (
        <Row k="前缀" v="（无）" dim />
      )}
    </NodeShell>
  );
}
