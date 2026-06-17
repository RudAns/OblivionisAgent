# OblivionisAgent — Claude Code 项目说明

把飞书(Feishu)群聊接入**本地 Claude Code 会话**的 Windows 桌面工具：不同群路由到不同会话、
意图分流、主人/访客权限隔离、访客会话自动脱敏，连线式画布配置，Tauri 打包成绿色 exe。

## ⚠️ 不可违反的硬约束

1. **必须遥控官方 `claude` CLI，绝不能拿订阅 OAuth 令牌直连 API**。
   Anthropic 自 2026-01 起服务端封禁第三方工具使用订阅令牌（2026-02 写入 ToS）。
   本项目一切 LLM 调用都通过 spawn 官方 CLI（`claude -p --output-format stream-json`），
   `apiKeySource:"none"` 即订阅鉴权。改成直连 API = 用户封号风险。
2. **两会话模型**：`baseSessionId`（开发会话）只属于软件内的终端；**所有飞书消息**
   （含主人）一律走它 fork 出的脱敏分身（`sessionId`）。详见
   `.claude/docs/architecture.md`。改路由逻辑前先读它。
3. **访客安全**：访客回复前要二次脱敏（`redactText`）；fork 时 transcript 抹密钥
   （`fork-prepare.ts`）。不要削弱这条链路。

## 仓库结构（详见 .claude/docs/architecture.md）

- `packages/shared` — zod 配置 schema + WS 协议 + stream-json 类型（被两端共享）
- `packages/bridge` — Node 引擎：飞书长连接、路由、会话管理、脱敏、审计（打包成 sidecar exe）
- `apps/desktop` — Tauri v2 + React：连线画布(@xyflow)、xterm 终端、Rust PTY(lib.rs)
- `rebuild-deploy.bat` — 一键构建+部署到便携版（先构建后关应用，顺序勿改）

## 文档地图（贡献者 / 二次开发从这进）

`.claude/docs/` 是给"想加功能的人（和他的 Claude Code）"准备的知识库，按需读：

| 想干什么 | 看哪篇 |
|---|---|
| 搞懂数据流 + 每个核心文件干什么 | [architecture.md](.claude/docs/architecture.md) |
| 写代码前的规范 / 约定 / 安全硬约束 | [conventions.md](.claude/docs/conventions.md) |
| **加功能的 step-by-step 配方**（加节点 / 命令 / 面板 / 消息 / transport / i18n…） | [extending.md](.claude/docs/extending.md) |
| 改终端 / 会话 / 配置前必查的踩坑库 | [pitfalls.md](.claude/docs/pitfalls.md) |
| 构建 / 调试 / 冒烟测试 / PTY 探针 / 接新群 | [workflows.md](.claude/docs/workflows.md) |
| 为什么遥控 CLI 而非调 API（选型依据） | [research-hermes-oauth.md](.claude/docs/research-hermes-oauth.md) |
| 生成**报告 / 演示型 HTML** 的视觉规范（Claude 暖色书卷风） | [docs/html-design.md](docs/html-design.md) |

> 让 AI 加功能时，先让它读 **architecture（地图）+ extending（配方）+ conventions（规范）**，再动手。

> 📐 **生成报告式（非玩法式）HTML 一律遵循 [`docs/html-design.md`](docs/html-design.md)**（软件介绍页 `docs/presentation.html` 就按它做）。要让某个会话产出的 HTML 自动套这套规范，把 [`docs/html-design.skill.md`](docs/html-design.skill.md) 贴进一个 🧩 技能节点连上去即可。

## 常用命令

```bash
pnpm install                      # 首次
pnpm --filter @oblivionis/bridge typecheck   # 引擎类型检查
cd apps/desktop && pnpm tauri build --no-bundle   # 构建桌面 app（不碰运行中的程序）
cd packages/bridge && pnpm package           # 打包 sidecar exe
# 部署 = 双击 rebuild-deploy.bat（构建→关应用→覆盖便携版→重启）
```

运行时配置在 `~/.oblivionis/config.json`（**不在仓库里**）。**App Secret 不再放这里**——存
Windows 凭据管理器（外壳从凭据库读出经 env `OBLIVIONIS_FEISHU_SECRET` 注入 bridge；见 `secret-store.ts`、
`src-tauri/lib.rs`）。别再往 config.json 写明文密钥；`config-store.save` 也会兜底清空它。
会话 transcript 在 `~/.claude/projects/<编码cwd>/<sessionId>.jsonl`。

## 许可证 & 第三方合规

- 本项目：**GPL-3.0**（强 copyleft；Copyright 2026 Derek·JW·Chen），见 `LICENSE`。意图＝"谁都能用甚至商用，但谁也别想把它闭源拿走"（用户研究后从 PolyForm Noncommercial 改来；曾一度定 AGPL-3.0 又改回 GPL-3.0；**注意 GPL 不禁商用**）。改许可前先确认意图。捆绑的依赖须 GPLv3 兼容——Apache-2.0 兼容 GPLv3（不兼容 GPLv2），故只能 v3。
- 成品捆绑的第三方依赖须保留其许可声明：`THIRD-PARTY-NOTICES.md` 由 `node scripts/gen-notices.cjs` 生成，**发布前重跑刷新**。依赖全宽松、无强 copyleft（含 5 个 MPL-2.0 弱 copyleft，未改动即可用）。

## 改代码前必读

- **踩坑记录**：`.claude/docs/pitfalls.md` — 本项目所有已付过学费的坑
  （会话路径编码、PTY 竞态、xterm 渲染、Shift+Enter 字节序、bat 编码…）。
  遇到"终端显示怪/会话接不上/配置丢失"先查它，大概率已有答案。
- **调试工具**：`apps/desktop/src-tauri/examples/` 下有现成的 PTY 探针
  （抓 claude 原始字节、测按键序列、验证历史回放），用法见 `.claude/docs/workflows.md`。
- xterm 三件套**锁定在 6.1/0.20 beta**（含上游图集修复 #5883），等 7.0 stable 再升，
  原因见 pitfalls.md「WebGL 中文乱码」条。
- 编辑 `~/.oblivionis/config.json` 时**绝不要把 sessionId/baseSessionId 写成空字符串**
  （schema 已加固为空串=未设置，但别依赖它）；清空会话用 GUI 的「刷新快照」。
- Windows 下写 `.bat`/`.cmd` 必须 **CRLF + 纯 ASCII**（GBK 码页 + LF 会整文件解析错乱）。
- 不要并行开多个 Claude Code 会话改同一批文件（历史上造成过终端组件被重构覆盖的事故）。
- **人格(SOUL.md)由主人手写严格设计**。做成可连线的「🎭 人格节点」，单「人格口」接到会话 = 作用于该会话飞书 fork（详见 architecture.md）；终端(base)人格评估后不做。人格**自动演化反思**（`runSoulReflection`/`reflect-soul.ts`）**已按用户要求关闭**（index.ts 注释掉了 24h 调度），别擅自重开。
