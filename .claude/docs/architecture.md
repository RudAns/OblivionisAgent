# 架构与核心代码地图

## 总体数据流

```
飞书群 @机器人
   │  (WebSocket 长连接, @larksuiteoapi/node-sdk)
   ▼
packages/bridge  (Node 引擎, 打包成 oblivionis-bridge.exe sidecar)
   │  transport/feishu-lark.ts 收消息(含被引用消息)
   │  index.ts 主循环: 判主人/访客 → 审计落盘 → 路由
   │  router.ts 按画布图(节点+连线)路由; intent-switch 节点经
   │  claude/classify-intent.ts (haiku, 无状态 claude -p) 做意图分流
   ▼
claude/session-manager.ts  ← 两会话模型的实现处
   │  有 baseSessionId: 飞书一律走 fork 脱敏分身(sessionId);
   │                    首次 prepareGuestFork → fork-prepare.ts
   │                    (claude -p --resume <base> --fork-session → 抹密钥)
   │  无 base: 单一 sessionId 主客共用
   ▼
claude/claude-session.ts  每条消息 = 一次子进程:
   │  claude -p --output-format stream-json --verbose --resume <sid>
   │  prompt 走 stdin; 事件经 hub.ts 广播给 GUI; usage/cost 记录
   ▼
回复 → index.ts 访客二次脱敏(secrets.ts redactText) → 飞书富文本回帖(@提问人)
```

GUI(桌面 app) 经 `ws://127.0.0.1:8920` 连 bridge（server.ts 是控制面）。

## 人格与两会话模型（Soul/Fork）

一个「Claude 会话」节点背后是**两条 claude 会话**，飞书永远只碰 fork：

```
   飞书群 ─@机器人─┐                 人格节点(SOUL.md) ─┐
                  │                                  │
                  ▼  消息入站                         ▼  人格口(连此=作用于飞书回复)
   ┌──────────────────────────────────────────────────────────┐
   │ Claude 会话 节点                                         │
   │   原始(base)      = 你的开发终端会话（只在软件终端里用） │
   │   脱敏分身(fork)   = 飞书消息一律走这条 · sid 26f5…      │
   │   护栏/群记忆/人格  都注入到 fork 这条，base 永不被碰    │
   └──────────────────────────────────────────────────────────┘
```

- **base（baseSessionId）**：软件里的开发终端会话。飞书永不续接它（避免污染开发上下文），不注入人格/护栏。
- **fork（脱敏分身 / sessionId）**：从 base fork + 抹密钥而来。**所有飞书消息（主人+访客）都走它**；人格(SOUL.md)、访客护栏、群记忆都注入这条；首次自动 fork，"刷新快照"可重新 fork。
- **人格(soul) 节点**：把 SOUL.md 做成可连线节点，连到会话的「人格口」即作用于该会话的飞书回复。注入解析见 `soul-store.ts: resolveSessionSoul`（按边找连到 fork 口的 soul 节点，找不到回退旧的"一会话一人格文件"）。一个人格可连多个会话。终端(base)注入人格：评估后认为不需要，未做。

## 目录与核心文件

### packages/shared — 两端共享的契约
| 文件 | 作用 |
|---|---|
| `config.ts` | **整个配置的 zod schema**（图/节点/边/owners/护栏）。节点种类: feishu-group / route / intent-switch / claude-session / cron / loop / webhook / **soul / skill / subagent**（后三=连到会话「赋能口」的赋能节点）。改配置结构从这里开始（加节点种类见 [extending.md 配方 1](extending.md)） |
| `protocol.ts` | GUI↔bridge 的 WS 消息类型 |
| `stream-json.ts` | claude stream-json 事件类型 + 辅助函数(assistantText 等) |

### packages/bridge — 引擎（Node, esbuild 打包 → @yao-pkg/pkg 出 exe）
| 文件 | 作用 |
|---|---|
| `index.ts` | **主入口/主循环**：飞书消息→isOwner 判定→权限/护栏→路由→会话→出站脱敏→回帖；审计落盘 |
| `router.ts` | 图遍历路由；条件边(意图)走 LLM 分类 |
| `claude/session-manager.ts` | **两会话模型**；会话实例池(key=nodeId)；persistSessionId 回写配置 |
| `claude/claude-session.ts` | 单会话执行器：串行队列、spawn claude、stream-json 解析、sessionId 捕获回写 |
| `claude/fork-prepare.ts` | fork + transcript 脱敏（主人 base 只读不动） |
| `claude/classify-intent.ts` | 意图分类（独立无状态 claude -p --model haiku --tools ""） |
| `claude/session-path.ts` | **transcript 路径编码**（cwd → `C--Users-...`；存在→--resume 否则 --session-id） |
| `claude/session-listing.ts` | 列某 cwd 下所有会话(给 GUI 选 baseSessionId 用) |
| `secrets.ts` | collectSecrets(appSecret + ~/.claude/.credentials.json) / redactText |
| `transcript-store.ts` | **转录持久化**：旁路监听 Hub 的 session-event 落盘 `~/.oblivionis/transcripts/<nodeId>.jsonl`，保留 3 天/节点 600 条；GUI 连接时经 `transcript-history` 整包回放 |
| `soul-store.ts` | **人格(SOUL.md)**：每节点 `~/.oblivionis/souls/<nodeId>.md`，原文注入 append-system-prompt 第一段；访客护栏永远压轴+优先级声明；首次播种 starter 绝不覆盖（设计依据见 vision-agentic-roadmap.md） |
| `skill-store.ts` / `subagent-store.ts` | **赋能节点**：技能(SKILL.md，操作规范) / 子代理(Claude Code 原生 subagent，独立上下文做重活)。各自 `resolveSessionXxx` 按连到会话「赋能口(fork)」的节点解析，注入 fork 的 appendPrompt（人格管怎么说话、技能管怎么做事、子代理委派重活）。「重锚人格」= 把当前赋能内容静默重新注入所连会话(留记忆) |
| `secret-store.ts` | **飞书 App Secret 运行时持有**：仅内存，来自外壳从 OS 凭据管理器读出经 env 注入；绝不写盘/广播（见 [conventions.md 安全约束](conventions.md)） |
| `usage-monitor.ts` | **订阅用量**：每 5 分钟 `claude -p "/usage"`（零 token、合规）解析 5h/周窗口百分比，广播 `usage-status` 给顶栏 |
| `knowledge-store.ts` + `claude/extract-knowledge.ts` | **知识收件箱**：问答后 haiku 提取"规则性指令"候选→`~/.oblivionis/knowledge-inbox.jsonl`→GUI 裁决→采纳追加 cwd 的 CLAUDE.md「群聊沉淀规则」小节 |
| `cron-scheduler.ts` | **定时任务**：30s tick；cron 节点到点→下游会话(脱敏分身)跑 prompt→结果(出站脱敏)发节点群或 homeChatId。栅栏：运行中跳过/无特权/不暴露建任务能力 |
| `loop-runner.ts` | **循环节点(Loop Engineering 驱动器)**：cron 升级版——对下游会话**反复**跑(第1轮 prompt、之后 continuePrompt 回灌进同一分身)直到**完成标记/满 maxRounds/超 maxCostUsd** 才停，汇总发群 + run-log 落盘 `~/.oblivionis/loop-logs/`。复用 cron 的 runPrompt/deliver;`run-loop` 消息手动触发;`shouldFire` 复用 cron。L1(只报告)，破坏性操作仍走审批卡。**Phase3 每 N 轮新鲜上下文**：`resetEvery>0` 时每 N 轮 `prepareGuestFork` 重新 fork 出新鲜分身，靠会话维护的 STATE.md 续接进度(引擎自动在指令里要求读写 STATE.md)。造-检模板见 `docs/loop-skill-template.md`。**实时镜像**：每轮发出的指令经 `mirrorInput` 合成一条 `loop-input` session-event 注入转录(转录面板渲染成「🔁 第N轮指令」)，GUI 能看到我每轮输入了什么(不只回复)。**详细报告**：`report=md\|html` 时循环收尾再多跑一轮把各轮产出喂回去整理成报告，落 `~/.oblivionis/reports/`(文档查看器可看)。P4 写改(只改不提交、留 pending CL)技能模板见 `docs/loop-p4-skill-template.md` |
| `claude/reflect-soul.ts` | **人格反思**（人格自主演化）：每 24h 对有人格+有近期群聊的节点提议 SOUL.md 修订 → 收件箱(kind=soul) 主人裁决。**⚠️ 已按用户要求关闭**——`index.ts` 的 24h 调度已注释（人格由主人手写、严格设计）；实现保留，恢复=取消注释 |
| `perm/mcp-perm-server.ts` | **审批 MCP 服务器**（`bridge --mcp-perm` 双模式自举）：claude 的 permission-prompt-tool → WS 回连 bridge → 等卡片决定 |
| `perm/permission-broker.ts` | **审批中枢**：挂起请求 ↔ 飞书交互卡片 ↔ 仅主人有效的回调；100s 超时拒绝 |
| `group-memory-store.ts` + `claude/distill-memory.ts` | **群记忆**：每群 `~/.oblivionis/groups/<chatId>.md`(配额 1500 字)注入会话；问答后 haiku 提炼覆写。GUI 飞书群节点「🧠 群记忆」可编辑 |
| `claude/parse-schedule.ts` | **自然语言建 cron**：仅主人+定时关键词粗筛→haiku 解析 {schedule,prompt}→建 cron 节点+连线 |
| `webhook-server.ts` | **Webhook 入口**：node:http 监听 `/hook/<token>`(0.0.0.0)；有 webhook 节点才起；事件→下游会话→脱敏发群 |
| `config-store.ts` | 配置读写（解析失败直接抛=宁崩不带病运行，保护数据） |
| `server.ts` | WS 控制面（GUI 测试框、刷新快照、列会话、查 openId…） |
| `hub.ts` | 向所有 GUI 客户端广播事件 |
| `transport/` | feishu-lark(真) + mock(测试)；收消息/回富文本；**发送者真名**经 contact API 解析(open_id→姓名, Map 缓存含失败) |
| `smoke*.ts` | 各功能冒烟测试（路由/分类/fork 脱敏），`npx tsx src/smoke-loop.ts` 可单跑 |

### apps/desktop — 桌面壳（Tauri v2 + React 18）

布局（2026-06-10 重构，参考专业 IDE）：
```
┌──────────────────────────── toolbar(品牌) ─────────────────────────────┐
│railbar│ SessionSidebar │        main: canvas(可收起) │ side 面板        │
│图标竖栏│  会话卡片列表    │  节点画布+浮窗+工具条  ⇄    │ 转录/终端/审计/日志│
└──────────────────── statusbar(引擎/飞书/会话统计) ─────────────────────┘
```

| 文件 | 作用 |
|---|---|
| `src/App.tsx` | **主装配**：状态中枢、配置同步(首图不覆盖+自动保存)、WS 消息分发、终端开启逻辑 |
| `src/i18n/` | **中英双语**：`index.tsx`（`LangProvider`/`useT`/`tStatic`）+ `en.ts`（中文原文→English 词表）。中文原文即 key，漏译回退中文。规则见 [conventions.md](conventions.md) |
| `src/layout/IconRail.tsx` | 左侧图标竖栏：节点图(画布开关) / 收件箱 / 审计 / 服务日志 / 设置（终端/转录改由选会话 + 面板顶部小页签进入）。图标在 `icons.tsx` |
| `src/layout/SessionSidebar.tsx` | 会话卡片列表(常驻)：单击=选中该会话（**视图粘滞**：保持当前 终端/转录 视图，不强制跳终端）；节点视图下单击=定位节点 |
| `src/layout/StatusBar.tsx` | 底部状态栏：引擎 WS/飞书连接/会话统计/当前终端 |
| `src/canvas/FlowCanvas.tsx` | React Flow 画布（劲道贝塞尔 curvature 0.5+箭头、彩色缩略图） |
| `src/canvas/nodes/NodeShell.tsx` | 节点卡片统一外壳（彩头+暗体，--nc 控色） |
| `src/canvas/nodes/*` | 十种节点卡片（基于 NodeShell）：飞书群/路由/意图分流/Claude会话/定时/循环/Webhook/人格/技能/子代理 |
| `src/canvas/edges/ConditionEdge.tsx` | 连线：意图条件徽标 + 运行时流动；赋能连线(人格/技能/子代理→会话)改虚线+按类型上色 |
| `src/panels/TerminalsHost.tsx` | **交互式终端（最核心、坑最多）**：多终端保活、历史回放缓冲、贴图、Ctrl+A/Ctrl+F、URL/md/html 可点击、ANSI 16 色精修、终端信息条、尺寸竞态对账。改前必读 pitfalls.md |
| `src/panels/TranscriptPanel.tsx` | 访客会话转录（含引擎回放的近 3 天历史） |
| `src/panels/AuditPanel.tsx` | 审计（真实姓名由引擎经通讯录解析） |
| `src/panels/FeishuPanel.tsx` | 飞书连接配置 + owner openId 查询 |
| `src/bridge-client.ts` | WS 客户端(自动重连 + 连接状态订阅) |
| `src-tauri/src/lib.rs` | **Rust 侧全部能力**：portable-pty 起交互式 claude(--resume 判定+跨目录搜会话)、pty 读写/resize、贴图存临时文件(save_paste_image)、点击路径打开(open_path: md→VSCode, 其它→系统默认)、拉起 bridge sidecar |
| `src-tauri/examples/` | PTY 调试探针（见 workflows.md） |

### 其它
- `scripts/gen-icon.mjs` — 生成图标（Windows 必须有 .ico）
- `scripts/gen-notices.cjs` — 生成 `THIRD-PARTY-NOTICES.md`（扫 JS 生产依赖 + Rust crate），发布前重跑
- `rebuild-deploy.bat` — 一键发布（构建→taskkill→覆盖便携版→重启）
- `LICENSE` — GPL-3.0（强 copyleft；不禁商用）；`THIRD-PARTY-NOTICES.md` — 第三方许可声明

## 关键运行时路径（都在用户目录，不进仓库）
- `~/.oblivionis/config.json` — 全部配置（**App Secret 已移出**：存 Windows 凭据管理器，
  外壳启动时从凭据库读出经 env `OBLIVIONIS_FEISHU_SECRET` 注入 bridge；见 `secret-store.ts` / `src-tauri/lib.rs`。
  首次启动自动迁移并清掉旧明文；密钥不再落盘、也不经 WS 广播）
- `~/.oblivionis/audit.jsonl` — 审计日志
- `~/.claude/projects/<编码cwd>/<sid>.jsonl` — claude 会话 transcript
  （编码规则：绝对路径非字母数字→`-`；**盘符可能是小写**，匹配时要兜底搜全部目录）
