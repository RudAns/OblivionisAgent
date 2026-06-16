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

  // ── 画布 / 节点卡片 Canvas & node cards ────────────
  "定时任务": "Scheduled task",
  "飞书群": "Feishu group",
  "路由": "Route",
  "意图分流": "Intent switch",
  "人格": "Persona",
  "技能": "Skill",
  "子代理": "Subagent",
  "Claude 会话": "Claude session",
  "时刻": "When",
  "指令": "Prompt",
  "投递": "Deliver",
  "路径": "Path",
  "触发": "Trigger",
  "模型": "Model",
  "模式": "Mode",
  "前缀": "Prefix",
  "权限": "Perms",
  "🖥️原始": "🖥️ Origin",
  "(未设置)": "(not set)",
  "(未生成)": "(not generated)",
  "（无）": "(none)",
  "⏸ 已停用": "⏸ Disabled",
  "全部消息": "All messages",
  "@机器人": "@bot",
  "优先级(顺序)": "Priority (in order)",
  "最佳匹配": "Best match",
  "右侧拉多条线，每条设意图": "Drag edges from the right; set an intent on each",
  "默认": "Default",
  "拖左侧 ● 到会话的": "Drag the left ● to a session's",
  "🎭人格/🧩技能/🦾子代理口": "🎭Persona / 🧩Skill / 🦾Subagent port",
  "🎭人格/🧩技能/🦾子代理": "🎭Persona / 🧩Skill / 🦾Subagent",
  "选中后在右侧面板编辑灵魂": "Select to edit the soul in the right panel",
  "选中后在右侧面板编辑 SKILL.md": "Select to edit SKILL.md in the right panel",
  "拖左侧 ● 连到会话；独立上下文做重活，claude 自动委派":
    "Drag the left ● to a session; heavy lifting in an isolated context, claude delegates automatically",
  "选中后在右侧面板编辑子代理定义": "Select to edit the subagent definition in the right panel",
  // NodeShell
  "运行中": "Running",
  "出错": "Error",
  "复制此节点": "Duplicate this node",
  "删除此节点及其连线": "Delete this node and its edges",
  // ClaudeSessionNode
  "终端 · 改于 {0}": "Terminal · edited {0}",
  "终端会话": "Terminal session",
  "首次运行生成": "Created on first run",
  "改于 {0}": "edited {0}",
  "已生成": "Generated",
  "首次访客消息时生成": "Created on first guest message",
  "脱敏分身": "Redacted fork",
  "飞书走这条": "Feishu uses this",
  // FlowCanvas 空画布引导
  "空画布 · 开始搭一条链路": "Empty canvas · build a path",
  "从上方 ＋ 工具条建节点。典型搭法:": "Create nodes from the ＋ toolbar above. Typical setup:",
  "连好后，在飞书群 @机器人 即可对话。连线会自动校验，连错会被拒绝。":
    "Once connected, @bot in the Feishu group to chat. Edges are validated automatically; invalid ones are rejected.",
  "提示：按住 Shift 点选 / 框选多个节点可批量对齐分布 · 右键空白处或 Ctrl+K 快速加节点。":
    "Tip: Shift-click / box-select multiple nodes to align & distribute · right-click empty space or Ctrl+K to add a node.",
  // ConditionEdge 连线徽标
  "运行轨迹：已触发 {0} 次": "Run trace: triggered {0}×",
  " · 最近 {0}": " · last {0}",
  "意图条件：{0}（点击编辑）": "Intent condition: {0} (click to edit)",
  "意图：{0}": "Intent: {0}",
  // AlignBar 对齐工具条
  "{0} 个节点": "{0} nodes",
  "左对齐": "Align left",
  "水平居中": "Align center (horizontal)",
  "右对齐": "Align right",
  "顶对齐": "Align top",
  "垂直居中": "Align middle (vertical)",
  "底对齐": "Align bottom",
  "水平等距分布（需≥3）": "Distribute horizontally (needs ≥3)",
  "垂直等距分布（需≥3）": "Distribute vertically (needs ≥3)",
};
