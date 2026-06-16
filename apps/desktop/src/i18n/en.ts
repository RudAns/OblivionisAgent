/**
 * 中文原文 → English。key 就是代码里写的中文原文（见 i18n/index.tsx 的 t()）。
 * 漏译的会自动回退显示中文，所以这张表可以逐屏逐屏地补全，不用一次到位。
 * 约定：占位符用 {0}{1}…，和中文 key 里保持一致。
 * 范围：只翻"非专业用语"的界面文案；技术标识符(sessionId/cwd/fork/PTY 等)与品牌名保持原样。
 */
export const EN: Record<string, string> = {
  // ── 语言切换 / 通用 ───────────────────────────────
  "语言": "Language",
  "切换界面语言（专业术语 / 标识符保持原样）。漏译的地方会暂时显示中文，正在逐步补全。":
    "Switch the UI language (technical terms / identifiers stay as-is). Untranslated bits temporarily show Chinese and are being filled in.",

  // ── 底部状态栏 StatusBar ──────────────────────────
  "本软件的后台服务（随应用自动启动，负责飞书收发与会话调度）":
    "This app's background service (auto-starts with the app; handles Feishu I/O and session routing)",
  "正在启动后台服务…": "Starting background service…",
  "当前终端": "Current terminal",
  "画布上的 Claude 会话节点数 / 已打开的终端数": "Claude session nodes on canvas / open terminals",
  "会话 {0} · 终端 {1}": "Sessions {0} · Terminals {1}",
  "已保存 ✓": "Saved ✓",
  "改动自动保存": "Auto-saved",

  // ── 左侧图标栏 IconRail ───────────────────────────
  "节点图（展开/收起连线画布）": "Node graph (expand/collapse canvas)",
  "知识收件箱 · 群聊沉淀的规则候选等你裁决":
    "Knowledge inbox · rule candidates distilled from chats, awaiting your decision",
  "审计 · 谁问了什么": "Audit · who asked what",
  "服务日志": "Service logs",
  "设置（主题等）": "Settings (theme, etc.)",

  // ── 设置浮窗 Settings ─────────────────────────────
  "设置": "Settings",
  "隐藏": "Hide",
  "主题": "Theme",
  "深色": "Dark",
  "浅色": "Light",
  "跟随系统": "System",
  "切换会一并设置 Claude 终端主题；浅色参考 Claude 主页配色，部分细节仍在调。":
    "Switching also sets the Claude terminal theme; light mode follows Claude's site palette (some details still being tuned).",
  "重开所有终端（{0}）—— 会话保留": "Reopen all terminals ({0}) — sessions kept",
  "完成任务桌面提示": "Task-done desktop alert",
  "关": "Off",
  "开": "On",
  "后台跑完任务时，右下角弹个小人提醒，点它回到会话。":
    "When a background task finishes, a mascot pops up at the bottom-right — click it to jump back to the session.",
  "小人停留时长：{0} 秒": "Mascot dwell time: {0}s",
  "👀 预览": "👀 Preview",
  "按当前时长弹一下小人看看效果（屏幕右下角）":
    "Pop the mascot once at the current duration to preview (bottom-right of screen)",
  "位置预览": "Position preview",
  "终端字号：{0}px": "Terminal font size: {0}px",
  "拖动调整所有终端字号；终端里也可 Ctrl + +/− 调整、Ctrl+0 复位。":
    "Drag to set all terminals' font size; inside a terminal you can also use Ctrl + +/− and Ctrl+0 to reset.",
  "🧪 路由测试（干跑·不发飞书）": "🧪 Route test (dry run · no Feishu send)",
  "选择群（飞书群节点）…": "Select a group (Feishu group node)…",
  "(未填 chatId)": "(no chatId)",
  "输入一句样例消息，看它命中哪条链路": "Type a sample message to see which path it hits",
  "▶ 测试路由": "▶ Test route",
  "只跑路由+意图分类，不真发飞书、不真跑会话；命中的连线会在画布上高亮 6 秒":
    "Runs only routing + intent classification — no real Feishu send, no real session; matched edges highlight on the canvas for 6s",
  "全局唤起热键（默认关）": "Global wake hotkey (off by default)",
  "如 CommandOrControl+Shift+O": "e.g. CommandOrControl+Shift+O",
  "画布配置": "Canvas config",
  "⬇ 导出": "⬇ Export",
  "把整张画布导出成 JSON 文件（已抹会话身份/密钥），可分享/进 git":
    "Export the whole canvas to a JSON file (session identity/secrets stripped); shareable / git-friendly",
  "⬆ 导入": "⬆ Import",
  "从 JSON 文件导入画布（会替换当前画布）": "Import a canvas from a JSON file (replaces the current canvas)",
  "导出抹掉会话身份与密钥；导入后会话首次收到飞书消息会自动重新 fork。":
    "Export strips session identity and secrets; after import each session re-forks automatically on its first Feishu message.",
};
