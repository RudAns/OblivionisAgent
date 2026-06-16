import type { ReactNode } from "react";
import { IconGraph, IconTranscript, IconTerminal, IconAudit, IconInbox, IconSettings } from "./icons.js";

export type RailKey = "canvas" | "transcript" | "terminal" | "audit" | "inbox" | "feishu" | "settings";

interface Props {
  /** 画布是否展开（高亮"节点图"项） */
  canvasOpen: boolean;
  /** 右侧面板当前标签 */
  tab: string;
  settingsOpen: boolean;
  /** 知识收件箱待裁决数（徽标） */
  inboxBadge?: number;
  onAction: (key: RailKey) => void;
}

function RailButton({
  title,
  active,
  badge,
  dataPopup,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  badge?: number;
  /** 标记此按钮是某浮窗的触发器，供"点外部关闭"逻辑跳过自身 */
  dataPopup?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`railbar-btn ${active ? "on" : ""}`}
      title={title}
      data-popup={dataPopup}
      onClick={onClick}
    >
      {children}
      {badge ? <span className="railbar-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}

/**
 * 最左侧图标竖栏（参考专业 IDE）。优先级自上而下：
 * ① 主视图(最重要)：节点图 + 终端，置顶成组；
 * ② 会话转录/服务日志(坍缩成一个入口，面板内切换，常态看转录) / 收件箱 / 审计；
 * 底部：设置。
 */
export function IconRail({ canvasOpen, tab, settingsOpen, inboxBadge, onAction }: Props) {
  return (
    <nav className="railbar">
      {/* ① 主视图：节点图 + 终端（本软件最核心的两个功能，置顶） */}
      <RailButton title="节点图（展开/收起连线画布）" active={canvasOpen} onClick={() => onAction("canvas")}>
        <IconGraph />
      </RailButton>
      <RailButton title="终端 · 开发会话" active={tab === "terminal"} onClick={() => onAction("terminal")}>
        <IconTerminal />
      </RailButton>
      <div className="railbar-sep" />
      {/* ② 会话转录 / 服务日志：坍缩成一个入口，进面板后用顶部小页签切换（常态=转录） */}
      <RailButton
        title="会话转录 / 服务日志"
        active={tab === "transcript" || tab === "logs"}
        onClick={() => onAction("transcript")}
      >
        <IconTranscript />
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
      <div className="railbar-spacer" />
      <RailButton title="设置（主题等）" active={settingsOpen} dataPopup="settings" onClick={() => onAction("settings")}>
        <IconSettings />
      </RailButton>
    </nav>
  );
}
