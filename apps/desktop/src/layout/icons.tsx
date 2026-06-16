/**
 * 左侧竖栏图标（内联 SVG 占位版）。
 * ⚠️ 用户明天会提供正式图标——届时把对应 <svg> 替换成 <img src=...> 或新的 path 即可，
 * 接口(尺寸 20x20、currentColor 着色)保持不变。
 */

interface IconProps {
  size?: number;
}

const base = (size = 20) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/** 节点图/画布 */
export function IconGraph({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="5.5" cy="6" r="2.4" />
      <circle cx="18.5" cy="6" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M7.4 7.4 10.5 16M16.6 7.4 13.5 16M7.9 6h8.2" />
    </svg>
  );
}

/** 终端 */
export function IconTerminal({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="m7 9.5 3 3-3 3M12.5 15.5H17" />
    </svg>
  );
}

/** 转录/对话 */
export function IconTranscript({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 21l1.6-5.3A8.5 8.5 0 1 1 21 12Z" />
      <path d="M8.5 10.5h7M8.5 14h4.5" />
    </svg>
  );
}

/** 审计 */
export function IconAudit({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 11.5 2.2 2.2L15.5 9" />
    </svg>
  );
}

/** 日志 */
export function IconLogs({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M5 5h14M5 9.5h14M5 14h9M5 18.5h6" />
    </svg>
  );
}

/** 飞书/连接 */
export function IconFeishu({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M13 5.5 8.5 10a4.6 4.6 0 0 0 0 6.5 4.6 4.6 0 0 0 6.5 0L19.5 12" />
      <path d="m11 18.5 4.5-4.5a4.6 4.6 0 0 0 0-6.5 4.6 4.6 0 0 0-6.5 0L4.5 12" opacity="0.55" />
    </svg>
  );
}

/** 知识收件箱 */
export function IconInbox({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M3 13.5 6 5h12l3 8.5" />
      <path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19v-5.5Z" />
    </svg>
  );
}

/** Markdown 文档查看器 */
export function IconMarkdown({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.2" />
      <path d="M6 15V9l3 3 3-3v6M17 9v5M15 12l2 2 2-2" />
    </svg>
  );
}

/** 阅读清单（给人看的报告/文档） */
export function IconReports({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M6 3.5h7l5 5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M13 3.5V9h5M8.5 13h7M8.5 16.5h5" />
    </svg>
  );
}

/** 深色（月亮） */
export function IconMoon({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M20.5 13.3A8.2 8.2 0 1 1 10.7 3.5 6.4 6.4 0 0 0 20.5 13.3Z" />
    </svg>
  );
}

/** 浅色（太阳） */
export function IconSun({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M2.5 12h2M19.5 12h2M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5" />
    </svg>
  );
}

/** 跟随系统（显示器） */
export function IconMonitor({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20.5h6M12 16.5v4" />
    </svg>
  );
}

/** 设置（齿轮） */
export function IconSettings({ size }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
