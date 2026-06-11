import type { ReactNode } from "react";
import { IconGraph, IconTranscript, IconTerminal, IconAudit, IconLogs, IconInbox, IconFeishu, IconSettings } from "./icons.js";

export type RailKey = "canvas" | "transcript" | "terminal" | "audit" | "logs" | "inbox" | "feishu";

interface Props {
  /** 画布是否展开（高亮"节点图"项） */
  canvasOpen: boolean;
  /** 右侧面板当前标签 */
  tab: string;
  feishuOpen: boolean;
  /** 知识收件箱待裁决数（徽标） */
  inboxBadge?: number;
  onAction: (key: RailKey) => void;
}

function RailButton({
  title,
  active,
  badge,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className={`railbar-btn ${active ? "on" : ""}`} title={title} onClick={onClick}>
      {children}
      {badge ? <span className="railbar-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}

/**
 * 最左侧图标竖栏（参考专业 IDE）：不常用的入口收在这里。
 * 节点图(画布开关) / 转录 / 终端 / 审计 / 日志，底部：飞书连接 / 设置(占位)。
 */
export function IconRail({ canvasOpen, tab, feishuOpen, inboxBadge, onAction }: Props) {
  return (
    <nav className="railbar">
      <RailButton title="节点图（展开/收起连线画布）" active={canvasOpen} onClick={() => onAction("canvas")}>
        <IconGraph />
      </RailButton>
      <div className="railbar-sep" />
      <RailButton title="转录 · 访客会话" active={tab === "transcript"} onClick={() => onAction("transcript")}>
        <IconTranscript />
      </RailButton>
      <RailButton title="终端 · 开发会话" active={tab === "terminal"} onClick={() => onAction("terminal")}>
        <IconTerminal />
      </RailButton>
      <RailButton
        title="知识收件箱 · 群聊沉淀的规则候选等你裁决"
        active={tab === "inbox"}
        badge={inboxBadge}
        onClick={() => onAction("inbox")}
      >
        <IconInbox />
      </RailButton>
      <RailButton title="审计 · 谁问了什么" active={tab === "audit"} onClick={() => onAction("audit")}>
        <IconAudit />
      </RailButton>
      <RailButton title="服务日志" active={tab === "logs"} onClick={() => onAction("logs")}>
        <IconLogs />
      </RailButton>
      <div className="railbar-spacer" />
      <RailButton title="飞书连接" active={feishuOpen} onClick={() => onAction("feishu")}>
        <IconFeishu />
      </RailButton>
      <button className="railbar-btn dim" title="设置（规划中）" disabled>
        <IconSettings />
      </button>
    </nav>
  );
}
