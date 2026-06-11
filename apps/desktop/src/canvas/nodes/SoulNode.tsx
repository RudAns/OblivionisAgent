import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell.js";

/**
 * 人格(Soul)节点：把 SOUL.md 做成可连线的节点。
 * 右侧 source 口 → 拖到「Claude 会话」节点的「原始口(终端)」或「Fork口(飞书分身)」。
 * 内容在 ~/.oblivionis/souls/<本节点 id>.md，选中后在 Inspector 里编辑。
 */
export function SoulNode({ data, selected }: NodeProps) {
  const d = data as { label: string; status?: string };
  return (
    <NodeShell kind="soul" icon="🎭" label={d.label || "人格"} selected={selected} hasTarget={false}>
      <div className="xnode-soul-hint">
        拖右侧 ● 到会话的<br />
        <b>原始口</b>(终端) 或 <b>Fork口</b>(飞书)
        <div className="dim">选中后在右侧面板编辑灵魂</div>
      </div>
    </NodeShell>
  );
}
