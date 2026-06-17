import type { ReactNode } from "react";
import { IconGraph, IconAudit, IconLogs, IconInbox, IconCost, IconMarkdown, IconSettings } from "./icons.js";
import { useT } from "../i18n/index.js";

export type RailKey = "canvas" | "audit" | "logs" | "inbox" | "cost" | "mdviewer" | "feishu" | "settings";

interface Props {
  /** 画布是否展开（高亮"节点图"项） */
  canvasOpen: boolean;
  /** 右侧面板当前标签 */
  tab: string;
  settingsOpen: boolean;
  /** 成本看板浮层是否打开（高亮入口） */
  costOpen?: boolean;
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
export function IconRail({ canvasOpen, tab, settingsOpen, costOpen, inboxBadge, onAction }: Props) {
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
      <RailButton title={t("成本看板 · 各会话 token 花费")} active={!!costOpen} dataPopup="cost" onClick={() => onAction("cost")}>
        <IconCost />
      </RailButton>
      <div className="railbar-spacer" />
      {/* 文档查看器：独立窗口，看各会话项目目录里的 .md / .html（渲染后），可边看边继续操作主窗 */}
      <RailButton
        title={t("文档查看器 · 看各项目目录里的 .md / .html（独立窗口）")}
        onClick={() => onAction("mdviewer")}
      >
        <IconMarkdown />
      </RailButton>
      <RailButton title={t("设置（主题等）")} active={settingsOpen} dataPopup="settings" onClick={() => onAction("settings")}>
        <IconSettings />
      </RailButton>
    </nav>
  );
}
