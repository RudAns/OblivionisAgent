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

  // ── 节点检视面板 Node inspector ────────────────────
  "点画布上的节点进行编辑": "Click a node on the canvas to edit it",
  "删除此节点及其连线（可 Ctrl+Z 撤销）": "Delete this node and its edges (Ctrl+Z to undo)",
  "🗑 删除": "🗑 Delete",
  "名称": "Name",
  "指令模板（{{body}}=请求体）": "Prompt template ({{body}} = request body)",
  "投递群 chatId": "Deliver-to group chatId",
  "触发时刻": "Trigger time",
  "指令 prompt": "Prompt",
  "分类模型(可空=haiku)": "Classifier model (blank = haiku)",
  "工作目录 cwd": "Working dir (cwd)",
  "模型(可空)": "Model (optional)",
  "追加 system prompt": "Extra system prompt",
  // feishu-group
  "@机器人才触发": "Only when @bot",
  "群内全部消息": "All messages in the group",
  "查看/编辑机器人对本群积累的长期记忆（GROUP.md，会自动维护，注入到该群会话）":
    "View/edit the bot's long-term memory for this group (GROUP.md, auto-maintained, injected into this group's sessions)",
  "🧠 群记忆 (GROUP.md)": "🧠 Group memory (GROUP.md)",
  // route
  "发给 Claude 前会自动去掉飞书 @ 占位符（无需配置）。这里只设可选「前缀」。":
    "Feishu @ placeholders are stripped automatically before reaching Claude (no config needed). Here you only set an optional prefix.",
  "可选。该路由下消息统一加的前缀（可多行）": "Optional. A prefix added to every message on this route (multi-line allowed)",
  // soul / skill / subagent 说明（去掉了内联 <b>，整段翻译）
  "人格 (SOUL.md)。把本节点右侧 ● 连到「Claude 会话」的 🎭人格口；连上即作用于该会话的所有飞书回复（fork 脱敏分身）。一个人格可连多个会话；未连任何会话则不生效。":
    "Persona (SOUL.md). Drag this node's right ● to a Claude session's 🎭Persona port; once connected it applies to all of that session's Feishu replies (the redacted fork). One persona can feed multiple sessions; connected to none, it has no effect.",
  "编辑这份人格文件 SOUL.md（首次自动生成模板，保存即生效）。人格只影响表达风格，访客安全护栏始终优先。":
    "Edit this persona file SOUL.md (a template is generated on first use; saving takes effect immediately). Persona only affects expression style; the guest safety guardrail always wins.",
  "🎭 编辑灵魂 (SOUL.md)": "🎭 Edit soul (SOUL.md)",
  "把这份人格立即重新注入到所有连着它的会话(留记忆)：往每个会话的 fork 静默跑一轮『切换到此人格』，用最近一轮压过历史里养成的旧口吻惯性。改完人格 / 刚连上会话后用它，比『刷新快照』轻——不清记忆。":
    "Immediately re-anchor this persona into every connected session (memory kept): silently run one 'switch to this persona' turn on each session's fork, using the latest turn to override the old tone built up in history. Use after editing the persona / just connecting a session — lighter than 'Refresh snapshot', it doesn't wipe memory.",
  "🔁 重锚到所连会话": "🔁 Re-anchor connected sessions",
  "技能 (SKILL.md)：操作性指令 / 话术 / 输出格式，和人格互补（人格管怎么说话，技能管怎么做事）。把本节点右侧 ● 连到「Claude 会话」的 🎭人格/🧩技能口；一个会话可连多个技能。":
    "Skill (SKILL.md): operational instructions / phrasing / output format, complementing the persona (persona = how to speak, skill = how to do). Drag this node's right ● to a Claude session's 🎭Persona/🧩Skill port; a session can have multiple skills.",
  "编辑这份技能文件 SKILL.md（首次自动生成模板，保存即生效）":
    "Edit this skill file SKILL.md (a template is generated on first use; saving takes effect immediately)",
  "🧩 编辑技能 (SKILL.md)": "🧩 Edit skill (SKILL.md)",
  "子代理：一个 Claude Code 原生子代理（独立上下文 + 独立工具）。会话里的 claude 会用 Task 工具按它的 description 自动委派给它做重活（文档/日志总结、消息分类），不污染主会话。连到会话的 🎭人格/🧩技能口作组织标识。":
    "Subagent: a native Claude Code subagent (isolated context + isolated tools). The session's claude uses the Task tool to auto-delegate heavy work to it by its description (doc/log summaries, message classification) without polluting the main session. Connect it to a session's 🎭Persona/🧩Skill port as an organizational marker.",
  "编辑子代理定义（首次自动生成模板，写在 ~/.claude/agents/，claude 自动发现）。务必改 name(英文唯一)+description(写清何时用)。":
    "Edit the subagent definition (a template is generated on first use under ~/.claude/agents/, auto-discovered by claude). Be sure to set name (unique, English) + description (state clearly when to use it).",
  "🦾 编辑子代理": "🦾 Edit subagent",
  // webhook
  "外部系统（Jenkins/CI/GitHub）POST 到下面这个地址即触发；把它连到一个「Claude 会话」节点。":
    "External systems (Jenkins/CI/GitHub) POST to the address below to trigger; connect it to a Claude session node.",
  "回调地址（POST · 同网段可达）": "Callback URL (POST · reachable on the same network)",
  "本机IP": "your-IP",
  "复制路径": "Copy path",
  "复制": "Copy",
  "留空 = 发到 Home Chat。外网回调需自建隧道（cloudflared/ngrok 指向 8921）。":
    "Blank = send to Home Chat. External callbacks need your own tunnel (cloudflared/ngrok → 8921).",
  "启用": "Enabled",
  // cron
  "支持：09:00(每天) · every 30m / every 2h(间隔)": "Supports: 09:00 (daily) · every 30m / every 2h (interval)",
  "留空 = 发到 Home Chat（在「飞书连接」面板设置）；连线到一个「Claude 会话」节点即生效":
    "Blank = send to Home Chat (set it in the Feishu connection panel); takes effect once connected to a Claude session node",
  // intent-switch
  "判定模式": "Decision mode",
  "优先级(连线顺序)": "Priority (edge order)",
  "从该节点右侧拉多条线到不同会话，点每条线设「触发意图」；留空的线=默认边。":
    "Drag multiple edges from the right to different sessions, click each edge to set its trigger intent; an edge left blank is the default.",
  // claude-session
  "主人权限(你@时)": "Owner perms (when you @)",
  "访客权限(他人@时)": "Guest perms (when others @)",
  "敏感操作飞书审批": "Feishu approval for sensitive ops",
  "工具调用需要授权时，向来源群发卡片由主人[允许/拒绝]（需 permissionMode=default 才会询问）":
    "When a tool call needs authorization, send a card to the source group for the owner to [Allow/Deny] (only asks when permissionMode = default)",
  "基础会话 (fork 来源，如「角色管线」会话)": "Base session (fork source, e.g. the 'character pipeline' session)",
  "留空=普通会话；填入则首次 fork 一份知识底座": "Blank = plain session; if set, forks a knowledge base on first run",
  "收起列表": "Collapse list",
  "列出该目录的会话…": "List sessions in this dir…",
  "立即从基础会话重新 fork 访客会话并脱敏(抹掉密钥)，吸收最新开发内容。会清掉 fork 的对话记忆。（只想换人格口吻、不想丢记忆 → 去人格节点点「重锚到所连会话」）":
    "Immediately re-fork the guest session from the base and redact it (strip secrets), absorbing the latest dev content. This wipes the fork's conversation memory. (Just want to change tone without losing memory → use 'Re-anchor connected sessions' on the persona node.)",
  "刷新快照(脱敏)": "Refresh snapshot (redact)",
  "粘贴 sessionId 或关键词搜索…": "Paste a sessionId or search by keyword…",
  "(无预览)": "(no preview)",
  "该目录暂无会话（确认 cwd 正确、且在该目录跑过 claude）":
    "No sessions in this dir (check the cwd is correct and that you've run claude there)",
  "无匹配。确认该 sessionId 属于此 cwd 目录；也可直接把 ID 粘到上面的 baseSessionId。":
    "No match. Make sure the sessionId belongs to this cwd; you can also paste the ID directly into baseSessionId above.",
  "运行会话 sid: ": "Running session sid: ",
  "首次 fork 后生成": "created after first fork",
  "🛡 安全态势": "🛡 Security posture",
  "本会话的安全态势（脱敏 fork / 出站脱敏 / 护栏 / 权限分级）":
    "This session's security posture (redacted fork / outbound redaction / guardrail / permission tiers)",
  "访客走脱敏 fork（开发会话只读不被污染）": "Guests use a redacted fork (the dev session is read-only, never polluted)",
  "访客回复出站二次脱敏 + 安全护栏": "Guest replies are re-redacted outbound + safety guardrail",
  "（未开）": "(off)",
  "主人权限 {0} · 访客权限 {1}": "Owner perms {0} · Guest perms {1}",

  // ── 工具条 / 菜单 / 命令面板 Toolbar, menus, Ctrl+K ──
  "飞书连接（点开/收起设置）": "Feishu connection (open/close settings)",
  "飞书": "Feishu",
  "编辑选中节点（画布收起时也可用）": "Edit selected node (works even when the canvas is collapsed)",
  "✎ 编辑节点": "✎ Edit node",
  "周 {0}%": "wk {0}%",
  "Claude 订阅用量": "Claude subscription usage",
  "5小时窗口: {0}%": "5-hour window: {0}%",
  " · {0}重置": " · resets {0}",
  "本周(全模型): {0}%": "This week (all models): {0}%",
  "每 5 分钟自动刷新": "Auto-refreshes every 5 min",
  // 横幅
  "收到来自": "Received a message from",
  "的消息，但没有匹配的群节点。": ", but no matching group node.",
  "用该 chatId 新建群节点": "Create a group node with this chatId",
  "忽略": "Ignore",
  // 连线意图浮窗
  "🗑 删除连线": "🗑 Delete edge",
  "连线意图（分流）": "Edge intent (routing)",
  "触发意图": "Trigger intent",
  "留空=默认边。填一句意图，如：用户想触发打包/角色管线CI/构建":
    "Blank = default edge. Write an intent, e.g.: user wants to trigger packaging / character-pipeline CI / build",
  "同一节点有多条带意图的出边时，引擎用 LLM 判断消息属于哪条；都不命中走「留空」的默认边。":
    "When a node has several intent-bearing outgoing edges, the engine uses an LLM to decide which one the message matches; if none match, it takes the blank default edge.",
  // ＋添加节点菜单
  "添加节点": "Add node",
  "输入源": "Inputs",
  "路由与决策": "Routing & decisions",
  "执行节点": "Execution",
  "辅助": "Aux",
  "右键添加节点 · 从端口拖到空白接新节点 · 滚轮缩放 · Ctrl+Z 撤销":
    "Right-click to add a node · drag from a port to empty space to attach one · scroll to zoom · Ctrl+Z to undo",
  // 飞书浮窗 / 测试框
  "飞书连接": "Feishu connection",
  "给该会话发测试消息（绕过飞书）": "Send a test message to this session (bypasses Feishu)",
  "发送": "Send",
  // 右键菜单 context menu
  "✎ 编辑": "✎ Edit",
  "⌨ 打开终端": "⌨ Open terminal",
  "就地生成一个副本（不经剪贴板）": "Make a copy in place (no clipboard)",
  "⧉ 再制": "⧉ Duplicate",
  "放入剪贴板，可粘贴到别处（含组内连线）": "Copy to clipboard, paste elsewhere (includes intra-group edges)",
  "⎘ 复制": "⎘ Copy",
  "删除节点及其连线（可 Ctrl+Z 撤销）": "Delete the node and its edges (Ctrl+Z to undo)",
  "（断开 {0} 条连线）": " (disconnects {0} edges)",
  "✎ 设置意图条件": "✎ Set intent condition",
  "删除连线（可 Ctrl+Z 撤销）": "Delete edge (Ctrl+Z to undo)",
  "📋 粘贴到此处": "📋 Paste here",
  "在此处添加节点": "Add a node here",
  "⤢ 适应视图": "⤢ Fit view",
  "在此处新建并连上": "Create here & connect",
  "（人格口）": " (Persona port)",
  // Ctrl+K 命令面板
  "搜索命令 / 添加节点…（↑↓ 选择，Enter 执行，Esc 关闭）":
    "Search commands / add nodes… (↑↓ select, Enter run, Esc close)",
  "没有匹配的命令": "No matching commands",
  "添加节点：{0}": "Add node: {0}",
  "节点": "Node",
  "全选节点": "Select all nodes",
  "复制选中（放入剪贴板）": "Copy selection (to clipboard)",
  "粘贴": "Paste",
  "删除选中（可撤销）": "Delete selection (undoable)",
  "适应视图（看全画布）": "Fit view (see whole canvas)",
  "视图": "View",
  "撤销": "Undo",
  "重做": "Redo",
  "定位节点：{0}": "Locate node: {0}",
  "搜索": "Search",
  // 面板标题旁的说明 TAB_DESC
  "谁(主人/访客)问了什么、命中哪个会话——只读留痕，不可改":
    "Who (owner/guest) asked what and which session it hit — a read-only trail, can't be edited",
  "群聊里沉淀出的规则 / 人格修订候选，等你采纳或忽略":
    "Rule / persona-revision candidates distilled from chats, awaiting your accept or ignore",
  "引擎 / 服务运行日志，排障时看": "Engine / service logs — for troubleshooting",
};
