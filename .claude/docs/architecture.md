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

## 目录与核心文件

### packages/shared — 两端共享的契约
| 文件 | 作用 |
|---|---|
| `config.ts` | **整个配置的 zod schema**（图/节点/边/owners/护栏）。节点种类: feishu-group / route / intent-switch / claude-session。改配置结构从这里开始 |
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
| `usage-monitor.ts` | **订阅用量**：每 5 分钟 `claude -p "/usage"`（零 token、合规）解析 5h/周窗口百分比，广播 `usage-status` 给顶栏 |
| `knowledge-store.ts` + `claude/extract-knowledge.ts` | **知识收件箱**：问答后 haiku 提取"规则性指令"候选→`~/.oblivionis/knowledge-inbox.jsonl`→GUI 裁决→采纳追加 cwd 的 CLAUDE.md「群聊沉淀规则」小节 |
| `cron-scheduler.ts` | **定时任务**：30s tick；cron 节点到点→下游会话(脱敏分身)跑 prompt→结果(出站脱敏)发节点群或 homeChatId。栅栏：运行中跳过/无特权/不暴露建任务能力 |
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
| `src/layout/IconRail.tsx` | 左侧图标竖栏：画布开关/转录/终端/审计/日志/飞书（图标在 `icons.tsx`，**占位 SVG，待用户提供正式图标**） |
| `src/layout/SessionSidebar.tsx` | 会话卡片列表(常驻)：单击=选中看转录，双击=开终端 |
| `src/layout/StatusBar.tsx` | 底部状态栏：引擎 WS/飞书连接/会话统计/当前终端 |
| `src/canvas/FlowCanvas.tsx` | React Flow 画布（劲道贝塞尔 curvature 0.5+箭头、彩色缩略图） |
| `src/canvas/nodes/NodeShell.tsx` | 节点卡片统一外壳（彩头+暗体，--nc 控色） |
| `src/canvas/nodes/*` | 四种节点（基于 NodeShell） |
| `src/panels/TerminalsHost.tsx` | **交互式终端（最核心、坑最多）**：多终端保活、历史回放缓冲、贴图、Ctrl+A/Ctrl+F、URL/md/html 可点击、ANSI 16 色精修、终端信息条、尺寸竞态对账。改前必读 pitfalls.md |
| `src/panels/TranscriptPanel.tsx` | 访客会话转录（含引擎回放的近 3 天历史） |
| `src/panels/AuditPanel.tsx` | 审计（真实姓名由引擎经通讯录解析） |
| `src/panels/FeishuPanel.tsx` | 飞书连接配置 + owner openId 查询 |
| `src/bridge-client.ts` | WS 客户端(自动重连 + 连接状态订阅) |
| `src-tauri/src/lib.rs` | **Rust 侧全部能力**：portable-pty 起交互式 claude(--resume 判定+跨目录搜会话)、pty 读写/resize、贴图存临时文件(save_paste_image)、点击路径打开(open_path: md→VSCode, 其它→系统默认)、拉起 bridge sidecar |
| `src-tauri/examples/` | PTY 调试探针（见 workflows.md） |

### 其它
- `scripts/gen-icon.mjs` — 生成图标（Windows 必须有 .ico）
- `rebuild-deploy.bat` — 一键发布（构建→taskkill→覆盖便携版→重启）

## 关键运行时路径（都在用户目录，不进仓库）
- `~/.oblivionis/config.json` — 全部配置（含 App Secret，**明文**，待加密）
- `~/.oblivionis/audit.jsonl` — 审计日志
- `~/.claude/projects/<编码cwd>/<sid>.jsonl` — claude 会话 transcript
  （编码规则：绝对路径非字母数字→`-`；**盘符可能是小写**，匹配时要兜底搜全部目录）
