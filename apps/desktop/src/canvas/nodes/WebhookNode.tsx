import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row } from "./NodeShell.js";
import { useT } from "../../i18n/index.js";

export function WebhookNode({ data, selected }: NodeProps) {
  const t = useT();
  const d = data as { label: string; token?: string; prompt?: string; chatId?: string; enabled?: boolean };
  return (
    <NodeShell kind="webhook" icon="🪝" label={d.label || "Webhook"} selected={selected} hasTarget={false}>
      <Row
        k={t("路径")}
        v={d.token ? `/hook/${d.token.slice(0, 8)}…` : t("(未生成)")}
        dim={!d.token}
        title={d.token ? `/hook/${d.token}` : undefined}
      />
      <Row k={t("投递")} v={d.chatId ? `…${d.chatId.slice(-10)}` : "Home Chat"} title={d.chatId || undefined} />
      {d.enabled === false ? <Row k="" v={t("⏸ 已停用")} dim /> : null}
    </NodeShell>
  );
}
