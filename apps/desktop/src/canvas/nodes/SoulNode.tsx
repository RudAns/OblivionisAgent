import { Position, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell.js";
import { useT } from "../../i18n/index.js";

/**
 * 人格(Soul)节点：把 SOUL.md 做成可连线的节点。
 * 右侧 source 口 → 拖到「Claude 会话」节点的「原始口(终端)」或「Fork口(飞书分身)」。
 * 内容在 ~/.oblivionis/souls/<本节点 id>.md，选中后在 Inspector 里编辑。
 */
export function SoulNode({ data, selected }: NodeProps) {
  const t = useT();
  const d = data as { label: string; status?: string };
  return (
    <NodeShell
      kind="soul"
      icon="🎭"
      label={d.label || t("人格")}
      selected={selected}
      hasTarget={false}
      sourcePosition={Position.Left}
    >
      <div className="xnode-soul-hint">
        {t("拖左侧 ● 到会话的")} <b>{t("🎭人格/🧩技能/🦾子代理口")}</b>
        <div className="dim">{t("选中后在右侧面板编辑灵魂")}</div>
      </div>
    </NodeShell>
  );
}
