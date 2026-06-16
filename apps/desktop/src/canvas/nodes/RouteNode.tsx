import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row } from "./NodeShell.js";
import { useT } from "../../i18n/index.js";

export function RouteNode({ data, selected }: NodeProps) {
  const t = useT();
  const d = data as { label: string; prefix?: string };
  return (
    <NodeShell kind="route" icon="🔀" label={d.label || t("路由")} selected={selected}>
      {d.prefix ? (
        <Row
          k={t("前缀")}
          v={d.prefix.length > 22 ? d.prefix.slice(0, 22) + "…" : d.prefix}
          title={d.prefix.length > 22 ? d.prefix : undefined}
        />
      ) : (
        <Row k={t("前缀")} v={t("（无）")} dim />
      )}
    </NodeShell>
  );
}
