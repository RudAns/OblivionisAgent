import { Position, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell.js";

/**
 * 技能(Skill)节点：把 SKILL.md 做成可连线的节点——操作性指令 / 话术 / 输出格式，和人格(SOUL)互补
 * （人格管"怎么说话"，技能管"怎么做事"）。右侧 source 口 → 拖到「Claude 会话」的「人格/技能口」。
 * 内容在 ~/.oblivionis/skills/<本节点 id>.md，选中后在右侧面板编辑。一个会话可连多个技能。
 */
export function SkillNode({ data, selected }: NodeProps) {
  const d = data as { label: string; status?: string };
  return (
    <NodeShell
      kind="skill"
      icon="🧩"
      label={d.label || "技能"}
      selected={selected}
      hasTarget={false}
      sourcePosition={Position.Left}
    >
      <div className="xnode-soul-hint">
        拖左侧 ● 到会话的 <b>🎭人格/🧩技能/🦾子代理口</b>
        <div className="dim">选中后在右侧面板编辑 SKILL.md</div>
      </div>
    </NodeShell>
  );
}
