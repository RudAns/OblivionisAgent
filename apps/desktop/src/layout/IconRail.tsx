import type { ReactNode } from "react";
import { IconGraph, IconAudit, IconLogs, IconInbox, IconReports, IconSettings } from "./icons.js";
import { useT } from "../i18n/index.js";

export type RailKey = "canvas" | "audit" | "logs" | "inbox" | "reports" | "feishu" | "settings";

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
 * 最左侧图标竖栏（参考专业 IDE）。
 * 主视图=节点图(画布)；终端/转录已改为"左侧选会话 + 面板顶部切换"，不再占图标栏。
 * 这里只放全局面板：收件箱 / 审计 / 服务日志；底部：设置。
 */
export function IconRail({ canvasOpen, tab, settingsOpen, inboxBadge, onAction }: Props) {
  const t = useT();
  return (
    <nav className="railbar">
      {/* 主视图：节点图（画布）。终端/转录靠左侧会话列表进入 */}
      <RailButton title={t("节点图（展开/收起连线画布）")} active={canvasOpen} onClick={() => onAction("canvas")}>
        <IconGraph />
      </RailButton>
      <div className="railbar-sep" />
      {/* 全局面板：收件箱 / 审计 / 服务日志 */}
      <RailButton
        title={t("知识收件箱 · 群聊沉淀的规则候选等你裁决")}
        active={tab === "inbox"}
        badge={inboxBadge}
        onClick={() => onAction("inbox")}
      >
        <IconInbox />
      </RailButton>
      <RailButton title={t("审计 · 谁问了什么")} active={tab === "audit"} onClick={() => onAction("audit")}>
        <IconAudit />
      </RailButton>
      <RailButton title={t("服务日志")} active={tab === "logs"} onClick={() => onAction("logs")}>
        <IconLogs />
      </RailButton>
      <div className="railbar-spacer" />
      {/* 阅读清单：Claude 生成的、给人读的报告/文档（放在设置正上方，便于随手翻看） */}
      <RailButton
        title={t("阅读清单 · Claude 生成的报告/文档，点开即读")}
        active={tab === "reports"}
        onClick={() => onAction("reports")}
      >
        <IconReports />
      </RailButton>
      <RailButton title={t("设置（主题等）")} active={settingsOpen} dataPopup="settings" onClick={() => onAction("settings")}>
        <IconSettings />
      </RailButton>
    </nav>
  );
}
