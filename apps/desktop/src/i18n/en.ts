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

  // ── 会话侧栏 SessionSidebar ────────────────────────
  "会话 · {0}": "Sessions · {0}",
  "新建 Claude 会话节点": "New Claude session node",
  "搜索会话 / 工作区…": "Search sessions / workspace…",
  "清除": "Clear",
  "还没有 Claude 会话节点": "No Claude session nodes yet",
  "没有匹配「{0}」的会话": "No sessions match “{0}”",
  "单击=查看此会话(保持当前 终端/转录 视图) · 拖动可排序":
    "Click = view this session (keeps the current terminal/transcript view) · drag to reorder",
  "会话": "Session",
  "终端任务已完成，还没查看": "Terminal task finished, not viewed yet",
  "终端已打开": "Terminal open",

  // ── 知识收件箱 InboxPanel ──────────────────────────
  "暂无待裁决的知识。": "No knowledge awaiting your decision.",
  "群聊问答中出现“规则性指令”（如“以后打包前先跑 lint”）时，会自动提取到这里等你裁决；采纳后写入项目的 CLAUDE.md，主会话与访客分身都会遵守。":
    "When a “rule-like instruction” shows up in chat (e.g. “always run lint before packaging”), it's auto-extracted here for your decision; once accepted it's written to the project's CLAUDE.md, which both the main session and guest forks follow.",
  "待裁决 · {0}": "Pending · {0}",
  "已处理": "Processed",
  "🎭 人格演化提案 · {0}": "🎭 Persona evolution proposal · {0}",
  "修订后的完整 SOUL.md，可直接编辑后采纳": "The full revised SOUL.md — edit it then accept",
  "可直接编辑后再采纳": "Edit then accept",
  "源于提问：{0}": "From question: {0}",
  "覆写该会话的 SOUL.md（下条消息生效）": "Overwrite this session's SOUL.md (effective next message)",
  "写入 {0}\\CLAUDE.md 的「群聊沉淀规则」小节": "Write to the 'distilled chat rules' section of {0}\\CLAUDE.md",
  "✅ 采纳 → 更新人格": "✅ Accept → update persona",
  "✅ 采纳 → CLAUDE.md": "✅ Accept → CLAUDE.md",
  "抛弃": "Discard",

  // ── 审计 AuditPanel ────────────────────────────────
  "暂无 @消息记录。": "No @messages logged yet.",
  "持久记录在 ": "Persisted at ",
  "主人": "Owner",
  "访客": "Guest",

  // ── 转录 TranscriptPanel ───────────────────────────
  "从左侧会话列表选择一个会话，查看访客提问的处理过程":
    "Pick a session from the list on the left to see how guest questions are handled",
  "该会话暂无访客活动。群里 @机器人 提问、或在节点编辑里发测试消息后，这里会实时显示处理过程（记录保留约 3 天）。":
    "No guest activity for this session yet. After @bot in a group or sending a test message in the node editor, the processing shows here live (kept ~3 days).",
  "🔎 搜索这个会话的历史…（保留约 3 天）": "🔎 Search this session's history… (kept ~3 days)",
  "没有匹配的内容": "No matching content",
  "初始化": "Init",
  "↪️ 工具结果": "↪️ Tool result",
  "完成": "Done",
  "{0} 轮": "{0} turns",

  // ── 飞书连接面板 FeishuPanel ───────────────────────
  "未连接": "Disconnected",
  "连接中…": "Connecting…",
  "已连接": "Connected",
  "连接出错": "Connection error",
  "Mock(本地调试)": "Mock (local debug)",
  "· 机器人：{0}": "· Bot: {0}",
  "域": "Domain",
  "已保存（留空则沿用）": "Saved (leave blank to keep)",
  "应用 Secret": "App Secret",
  "feishu（飞书/国内）": "feishu (Feishu / China)",
  "lark（海外）": "lark (overseas)",
  "保存并连接": "Save & connect",
  "重连": "Reconnect",
  "断开": "Disconnect",
  "主人（@机器人时可改代码；其余人只读咨询）":
    "Owners (can change code when they @bot; everyone else gets read-only Q&A)",
  "尚未设置主人——目前所有人 @ 都只读咨询（fail-closed）。":
    "No owner set yet — for now everyone who @s gets read-only Q&A (fail-closed).",
  "姓名(可填)": "Name (optional)",
  "移除": "Remove",
  "添加": "Add",
  "手机号": "Mobile",
  "或邮箱": "or email",
  "查 open_id": "Look up open_id",
  "查询失败：{0}（需通讯录权限 contact:user.id:readonly）":
    "Lookup failed: {0} (needs the contact:user.id:readonly scope)",
  "设为主人": "Set as owner",
  "主人只能在本机刻意设置（飞书里的人无法自助成为主人）。手机号/邮箱查询用于直接查到你自己的 open_id；日志里也会显示发送者 open_id 作参考。":
    "Owners can only be set deliberately on this machine (no one in Feishu can make themselves an owner). The mobile/email lookup is for finding your own open_id; the logs also show each sender's open_id for reference.",
  "Home Chat（运维群：定时任务结果/服务通知默认发这里）":
    "Home Chat (ops group: cron results / service notices go here by default)",
  "chatId (oc_...)，可从画布上的群节点复制": "chatId (oc_...), copy it from a group node on the canvas",
  "保存": "Save",
  "飞书后台需开通以下权限：im:message、im:message:send_as_bot、im:chat、im:resource；事件订阅选「长连接」并订阅 im.message.receive_v1。":
    "In the Feishu console, grant: im:message, im:message:send_as_bot, im:chat, im:resource; for event subscription choose 'long connection' and subscribe to im.message.receive_v1.",

  // ── 终端区 TerminalsHost ───────────────────────────
  "交互式 Claude 终端（Ctrl+V 粘贴 · Ctrl+A 选中输入框 · Ctrl+C 复制选区/否则中断 · Shift+Enter 换行 · 右键复制或粘贴）":
    "Interactive Claude terminal (Ctrl+V paste · Ctrl+A select input · Ctrl+C copy selection / else interrupt · Shift+Enter newline · right-click to copy or paste)",
  "[进程已退出]": "[process exited]",
  "(默认目录)": "(default dir)",
  "搜索终端内容…  Enter=下一个  Shift+Enter=上一个  Esc=关闭":
    "Search terminal content…  Enter=next  Shift+Enter=prev  Esc=close",
  "上一个 (Shift+Enter)": "Previous (Shift+Enter)",
  "下一个 (Enter)": "Next (Enter)",
  "关闭 (Esc)": "Close (Esc)",
  "移除预览（不影响已粘进输入的路径）": "Remove preview (doesn't affect paths already pasted into input)",
  "点击任意处关闭": "Click anywhere to close",
  "真实终端仅在桌面应用中可用（浏览器开发版不支持）。":
    "A real terminal is only available in the desktop app (not in the browser dev build).",
  "双击画布上的「Claude 会话」节点打开终端。多个终端会同时保活，切换/切标签都不会关闭。":
    "Double-click a Claude session node on the canvas to open a terminal. Multiple terminals stay alive at once; switching tabs won't close them.",
  "关闭此终端": "Close this terminal",
  "重绘当前终端（清理偶发的叠印残影）": "Redraw the current terminal (clears occasional overprint artifacts)",
  "会话 {0}": "Session {0}",
  "点击放大": "click to enlarge",

  // ── 小人提醒 Mascot ────────────────────────────────
  "点我回到完成的会话": "Click to return to the finished session",
  "完成啦": "Done!",

  // ── 错误边界 ErrorBoundary ─────────────────────────
  "界面出错了（已被拦住，未白屏）": "The UI hit an error (caught — no white screen)",
  "把下面这段报错截图/复制发给开发者即可精准修复：":
    "Screenshot/copy the error below and send it to the developer for a precise fix:",
  "重载界面": "Reload UI",

  // ── 服务日志 LogPanel ──────────────────────────────
  "暂无日志": "No logs yet",

  // ── 窗口控件 / 杂项 ────────────────────────────────
  "最小化": "Minimize",
  "最大化 / 还原": "Maximize / restore",
  "关闭": "Close",
  "这个会话的开发终端（软件里的本地 Claude 会话）": "This session's dev terminal (the local Claude session in-app)",
  "这个会话的飞书脱敏分身回复转录": "This session's Feishu redacted-fork reply transcript",
  // 面板标题 TAB_TITLE / 检视浮窗头 / 杂项
  "转录 · {0} 的访客会话": "Transcript · {0}'s guest session",
  "转录 · 访客会话（左侧选择一个会话）": "Transcript · guest session (pick one on the left)",
  "终端 · {0}": "Terminal · {0}",
  "终端 · 开发会话": "Terminal · dev session",
  "知识收件箱": "Knowledge inbox",
  " · {0} 条待裁决": " · {0} pending",
  "{0} 设置": "{0} settings",
  "（画布已收起）": " (canvas collapsed)",
  "(未命名群)": "(unnamed group)",
  "新群": "New group",
  "新会话": "New session",
  // 路由测试结果（事件回调，用 tStatic）
  "⚠️ 出错：{0}": "⚠️ Error: {0}",
  "❌ 无匹配链路（检查群是否建了节点、是否需要 @、意图边是否覆盖）":
    "❌ No matching path (check the group node exists, whether @ is required, and that intent edges cover it)",
  "✅ 命中会话「{0}」 · 走过 {1} 条连线": "✅ Hit session “{0}” · traversed {1} edges",
  "→ 发给 Claude：{0}": "→ Sent to Claude: {0}",
  "导入失败：{0}": "Import failed: {0}",
  "按组合键把窗口唤到最前。格式如 CommandOrControl+Shift+O、Alt+Space；不生效多半是被别的软件占用了，换一个。":
    "A key combo brings the window to the front. Format like CommandOrControl+Shift+O or Alt+Space; if it doesn't work, another app probably grabbed it — try a different one.",
  // 项目 / GitHub
  "项目": "Project",
  "在浏览器打开项目仓库（GitHub）": "Open the project repository (GitHub) in your browser",
  // 阅读清单 Reports
  "阅读清单 · Claude 生成的报告/文档，点开即读":
    "Reading list · reports/docs Claude made for you, click to open",
  "阅读清单 · Claude 生成的报告/文档": "Reading list · reports/docs Claude generated",
  "阅读清单": "Reading list",
  "Claude 为你生成的、需要你阅读的报告与文档（不含代码/配置改动）":
    "Reports and docs Claude generated for you to read (no code/config changes)",
  "阅读清单仅在桌面应用中可用（浏览器开发版不支持）。":
    "The reading list is only available in the desktop app (not the browser dev build).",
  "还没有文档。": "No documents yet.",
  "Claude 为你生成的报告 / 文档（HTML、Markdown 等）会出现在这里——只收阅读材料，不含代码或配置改动。":
    "Reports / docs Claude generates for you (HTML, Markdown, etc.) appear here — reading material only, no code or config changes.",
  "刷新中…": "Refreshing…",
  "刷新": "Refresh",
  "打开文件夹": "Open folder",
  "点击打开：{0}": "Click to open: {0}",
  "读取失败：": "Failed to read: ",
  // Markdown 查看器
  "Markdown 查看器 · 看各项目目录里的 .md（已渲染）": "Markdown viewer · browse rendered .md across project dirs",
  "Markdown 查看器": "Markdown viewer",
  "查看各会话项目目录下的 Markdown 文档（已渲染）": "Browse rendered Markdown docs across each session's project directory",
  "Markdown 查看器仅在桌面应用中可用（浏览器开发版不支持）。":
    "The Markdown viewer is only available in the desktop app (not the browser dev build).",
  "公共 · reports": "Shared · reports",
  "切换目录": "Directories",
  "没有可用的会话目录。": "No session directories available.",
  "文档": "Documents",
  "（文件过多，已截断）": " (too many files, truncated)",
  "扫描中…": "Scanning…",
  "此目录下没有 .md 文件。": "No .md files in this directory.",
  "（根目录）": "(root)",
  "← 左侧选一个目录和文件": "← Pick a directory and file on the left",
  "用 VSCode 打开": "Open in VSCode",
  "加载中…": "Loading…",
  // 文档查看器（独立窗口，md + html）
  "文档查看器 · 看各项目目录里的 .md / .html（独立窗口）":
    "Doc viewer · view .md / .html across project dirs (separate window)",
  "文档查看器": "Doc viewer",
  "各会话项目目录里的 .md / .html（已渲染）": "Rendered .md / .html across each session's project directory",
  "文档查看器仅在桌面应用中可用。": "The doc viewer is only available in the desktop app.",
  "重新扫描（有新文档时点它）": "Rescan (click when new docs appear)",
  "此目录下没有 .md / .html 文档。": "No .md / .html docs in this directory.",
  "← 左侧选一个文档": "← Pick a document on the left",
  "用默认程序打开": "Open with default app",
  "已复制 ✓": "Copied ✓",
  // 文档查看器：搜索 / 近期 / UX
  "搜索本工作区文件…": "Search files in this workspace…",
  "搜索结果 · {0}": "Results · {0}",
  "没有匹配「{0}」的文件": 'No files match "{0}"',
  近期修改: "Recently modified",
  全部文档: "All documents",
  刚刚: "just now",
  "{0} 分钟前": "{0}m ago",
  "{0} 小时前": "{0}h ago",
  "{0} 天前": "{0}d ago",
  // Webhook HMAC
  "HMAC 密钥（可选）": "HMAC secret (optional)",
  "HMAC 密钥设了就校验请求签名头（X-Hub-Signature-256 / X-Signature），防伪造回调；留空=不校验。每 token 限流 60 次/分钟。":
    "If set, requests must carry a valid signature header (X-Hub-Signature-256 / X-Signature, HMAC-SHA256) — blocks forged callbacks; empty = no check. Each token is rate-limited to 60/min.",
  // 成本看板 Cost
  "成本看板": "Cost",
  "成本看板 · 各会话 token 花费": "Cost · token spend per session",
  "成本看板 · 各会话 token 花费（独立窗口）": "Cost · token spend per session (separate window)",
  "各会话 token 花费（数据来自每次运行的 cost_usd）": "Token spend per session (from each run's cost_usd)",
  // 状态栏上下文用量
  "当前终端 · 悬停看上下文用量": "Current terminal · hover for context usage",
  "上下文用量（估算）": "Context usage (estimated)",
  "固定开销": "Fixed overhead",
  "对话消息": "Conversation",
  空闲: "Free",
  "接近自动压缩，建议尽快 /compact 控制保留内容":
    "Near auto-compact — run /compact soon to control what's kept",
  "上次回合输出 {0} · 读 transcript 估算，不耗 token":
    "Last turn output {0} · estimated from transcript, no tokens spent",
  // 顶部「周活跃 / 状态」小标
  "Claude 活动统计（读本地缓存，不耗 token）": "Claude activity stats (reads local cache, no tokens)",
  "周 {0} 天": "{0} days/wk",
  "活动统计（估算）": "Activity (estimated)",
  "连续活跃": "Current streak",
  "{0} 天": "{0} days",
  "近 7 天消息量": "Messages, last 7 days",
  "本周消息": "Msgs this week",
  "本周会话": "Sessions",
  "本周活跃": "Active days",
  "{0}/7 天": "{0}/7 days",
  "本周工具调用": "Tool calls",
  "累计 {0} 会话 · {1} 消息": "{0} sessions · {1} messages all-time",
  "截至 {0}": "as of {0}",
  "Claude 状态（读本地配置，不耗 token）": "Claude status (reads local config, no tokens)",
  "Claude 状态": "Claude status",
  账号: "Account",
  邮箱: "Email",
  套餐: "Plan",
  "CLI 版本": "CLI version",
  版本: "Version",
  构建: "Build",
  "近 7 天活动趋势 · 悬停看 30 天用量": "7-day activity · hover for 30-day usage",
  "近 7 天活动趋势 · 悬停看本月用量与统计": "7-day activity · hover for this month & stats",
  "活动用量（读本地缓存，不耗 token）": "Activity & usage (local cache, no tokens)",
  "近 30 天每日消息（今天高亮）": "Daily messages, last 30 days (today highlighted)",
  本月: "This month",
  今日宜忌: "Today's almanac",
  "一 二 三 四 五 六 日": "M T W T F S S",
  少: "Less",
  多: "More",
  常用模型: "Top model",
  "总 token": "Total tokens",
  最长会话: "Longest session",
  活跃天数: "Active days",
  最长连续: "Longest streak",
  最活跃: "Most active",
  当前连续: "Current streak",
  "各会话的 token 花费：累计 / 今日 / 按会话 / 按天（数据来自每次运行的 cost_usd）":
    "Token spend per session: total / today / by session / by day (from each run's cost_usd)",
  "还没有花费记录。": "No cost records yet.",
  "每次「Claude 会话」运行完成后这里会记一笔（数据来自 stream-json 的 cost_usd）。":
    "Each time a Claude session finishes a run, a record is added here (from the stream-json cost_usd).",
  "累计花费": "Total spend",
  "今日花费": "Today",
  "会话数": "Sessions",
  "{0} 次运行": "{0} runs",
  "按会话": "By session",
  "近 14 天": "Last 14 days",
  "最近运行": "Recent runs",
  "次": "runs",
  // —— 导出画布图片 / 节点编辑器弹窗 / 欢迎主页（Home）——
  "导出中…": "Exporting…",
  "⬇ 导出图片": "⬇ Export image",
  "导出高清画布图片（PNG，可分享）": "Export the canvas as a high-res PNG (for sharing)",
  "Home · 欢迎主页（总览与各界面入口）": "Home · welcome page (overview & entry points)",
  "把飞书群接入本地 Claude 会话 · 连线即编排":
    "Wire Feishu groups to local Claude sessions — orchestrate by connecting nodes",
  "会话节点": "Session nodes",
  "打开的终端": "Open terminals",
  "飞书未连接": "Feishu offline",
  "节点编排总览": "Orchestration overview",
  "打开画布 →": "Open canvas →",
  "还没有节点 · 点这里开始搭第一条链路": "No nodes yet — click here to build your first pipeline",
  "打开节点编排画布": "Open the orchestration canvas",
  "本地官方 Claude CLI 会话，软件的「指挥所」": "Local official Claude CLI session — the app's command post",
  "群聊沉淀的规则候选，等你采纳或忽略": "Rule candidates distilled from chats, awaiting your decision",
  "审计": "Audit",
  "谁(主人/访客)问了什么 · 只读留痕": "Who (owner/guest) asked what · read-only trail",
  "各会话 token 花费一览": "Token spend across sessions at a glance",
  "机器人连接、群路由与 Home Chat": "Bot connection, group routing & Home Chat",
  "主题 / 语言 / 偏好": "Theme / language / preferences",
  // —— 欢迎主页一图流仪表盘 / 节点画布独立窗口 ——
  "开着的终端": "Open terminals",
  "待裁决": "Pending",
  "节点画布": "Node canvas",
  "进入终端": "Open terminal",
  "打开节点编排窗口": "Open the node-orchestration window",
  "还没有节点 · 点这里打开画布搭第一条链路": "No nodes yet — click to open the canvas and build your first pipeline",
  "累计会话": "Sessions",
  "累计消息": "Messages",
  "订阅用量": "Subscription usage",
  "每 5 分钟刷新": "Refreshes every 5 min",
  "5 小时窗口": "5-hour window",
  "本周（全模型）": "This week (all models)",
  "{0} 重置": "resets {0}",
  "查看全部 →": "View all →",
  "今日": "Today",
  "累计": "Total",
  "运行": "Runs",
  "近 14 天每日花费": "Daily spend, last 14 days",
  "暂无花费数据": "No spend data yet",
  "点开看成本看板全量": "Open the full cost dashboard",
  "活动日历": "Activity calendar",
  "消息": "messages",
  "宜": "Do",
  "忌": "Don't",
  "周": "Wk",
  "(未命名)": "(unnamed)",
  "暂无花费数据 · 跑过会话后这里按花费排行": "No spend yet · sessions rank by cost here once they run",
  // —— 循环节点(Loop) ——
  "循环": "Loop",
  "手动": "Manual",
  "任务": "Task",
  "停止": "Stop",
  "轮": "r",
  "满轮数": "max rounds",
  "完成标记": "Done marker",
  "停止方式": "Stop when",
  "出现完成标记即停": "Done marker appears",
  "固定跑满轮数": "Fixed N rounds",
  "最多轮数(刹车)": "Max rounds (brake)",
  "预算上限 $（0=不限）": "Budget cap $ (0=none)",
  "触发时刻（空=仅手动）": "Schedule (blank=manual)",
  "启用定时": "Enable schedule",
  "▶ 跑一次": "▶ Run once",
  "任务 prompt（第 1 轮发的指令）": "Task prompt (round 1)",
  "继续语（第 2 轮起每轮发）": "Continue prompt (round 2+)",
  "留空=只手动「跑一次」；或填 09:00 / every 30m 自动触发":
    "Blank = manual run only; or 09:00 / every 30m to auto-trigger",
  "留空=发到 Home Chat；必须连到一个「Claude 会话」节点才会跑":
    "Blank = Home Chat; must connect to a Claude session node to run",
  "运行中… 第 {0}/{1} 轮": "Running… round {0}/{1}",
  "上次：{0}": "Last: {0}",
  "循环会对下游会话反复发指令，直到完成标记/满轮数/超预算；只报告，破坏性操作仍走审批卡。":
    "The loop repeatedly prompts the downstream session until the done marker / max rounds / budget cap; report-only — destructive actions still go through the approval card.",
  "每 N 轮重置上下文（0=不重置）": "Reset context every N rounds (0=off)",
  "长循环防上下文膨胀：每 N 轮重新 fork 新鲜分身，靠工作目录 STATE.md 续接进度（引擎自动要求会话读写它）。":
    "Long-loop anti-bloat: re-fork a fresh session every N rounds, carrying progress via STATE.md in the work dir (the engine auto-instructs the session to read/write it).",
  "第 {0} 轮指令": "Round {0} prompt",
  "详细报告": "Detailed report",
  "不生成": "None",
  "除审核群的简要汇总外，循环结束后再多跑一轮整理一份详细报告，存到 ~/.oblivionis/reports/（文档查看器可看）。":
    "Beyond the brief summary in the review group, run one extra round after the loop to compile a detailed report into ~/.oblivionis/reports/ (visible in the doc viewer).",
  "⏹ 强制中断": "⏹ Force-stop",
  "⏵ 继续": "⏵ Continue",
  "「跑一次」从初始任务开始；「继续」直接用「继续语」往下接着跑（不重发任务）；「强制中断」杀掉正在跑的那轮并停止。":
    "“Run once” starts from the initial task; “Continue” keeps going with the continue-prompt (without re-sending the task); “Force-stop” kills the in-flight round and stops.",
  "📖 怎么写好循环提示词？（点开）": "📖 How to write good loop prompts? (expand)",
  "继续语要「自包含」：每轮自己读状态文件（如 STATE.md）判断进度，别靠上一轮的记忆——上下文会被压缩、开了重置会被清空。":
    "Make the continue-prompt self-contained: each round reads a state file (e.g. STATE.md) to know its progress — don't rely on the previous round's memory (context gets compacted, and reset wipes it).",
  "写明「一轮只做一件事、做完立即结束本轮、不要一轮做多个」，否则模型会自己一波跑完、失控。":
    "Spell out “do exactly one thing per round, stop immediately when done, never do multiple in one round” — otherwise the model runs ahead and does them all at once.",
  "每轮把进度写回 STATE.md；检测规则/要求放系统提示或单独文件、每轮读，别只写在第 1 轮 prompt（一次性的，会被压缩/重置丢掉）。":
    "Write progress back to STATE.md each round; put rules/requirements in the system prompt or a separate file read every round — not only in round 1's prompt (it's one-shot and gets lost to compaction/reset).",
  "完成标记单独成行，且只在「全部做完」时才回。":
    "Put the done-marker on its own line, and only emit it when everything is finished.",
};
