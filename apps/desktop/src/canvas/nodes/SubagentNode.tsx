import { Position, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell.js";

/**
 * 子代理(Subagent)节点：管理一个 Claude Code 原生子代理(~/.claude/agents/)。会话里的 claude
 * 用内置 Task 工具按 description 自动委派给它——在**独立上下文 + 独立工具**里做重活
 * （文档/日志总结、消息分类等），不污染主会话上下文。右侧 ● 连到「Claude 会话」的「人格/技能口」
 * 作组织标识；选中后在右侧面板编辑子代理定义。
 */
export function SubagentNode({ data, selected }: NodeProps) {
  const d = data as { label: string; status?: string };
  return (
    <NodeShell
      kind="subagent"
      icon="🦾"
      label={d.label || "子代理"}
      selected={selected}
      hasTarget={false}
      sourcePosition={Position.Left}
    >
      <div className="xnode-soul-hint">
        拖左侧 ● 连到会话；独立上下文做重活，claude 自动委派
        <div className="dim">选中后在右侧面板编辑子代理定义</div>
      </div>
    </NodeShell>
  );
}
