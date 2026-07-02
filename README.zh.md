<div align="center">

<img src="docs/screenshots/cover.jpg" alt="OblivionisAgent" width="260" />

# 🌒 OblivionisAgent

**给本地 Claude Code CLI 的「连线式控制台」- 可视化编排会话、不同群聊指向不同的本地会话、优化你驱动它的方式**

**你在本地会话能做到的功能，Fork后的访客会话也能做到**

拖节点连线就能编排本地 claude 会话：多会话路由、意图分流、人格 / 技能 / 子代理赋能、**自主循环跑活**、内置交互终端、敏感操作审批……把「怎么驱动 Claude CLI」整套做成**可视化、可调优**。
其中**一项能力**是接入**飞书群聊**——群里 @机器人 → 路由到对应项目的会话 → 富文本回帖并 @提问人，访客与你的开发互不污染。

![platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D6?logo=windows&logoColor=white)
![Claude](https://img.shields.io/badge/LLM-官方%20Claude%20CLI-D97757)
![License](https://img.shields.io/badge/License-GPL%20v3-3b82f6)
[![CI](https://github.com/RudAns/OblivionisAgent/actions/workflows/ci.yml/badge.svg)](https://github.com/RudAns/OblivionisAgent/actions/workflows/ci.yml)

[English](README.md) · **简体中文**

[更新日志 CHANGELOG](CHANGELOG.md) · [贡献指南 CONTRIBUTING](CONTRIBUTING.md) · [安全策略 SECURITY](SECURITY.md)

<br/>

<img src="docs/screenshots/welcome.png" alt="OblivionisAgent 欢迎界面" width="880" />

<sub>欢迎界面一图流 —— 节点编排总览 · 活动日历 · 成本 · 订阅用量 · 循环舰队，一眼尽收。</sub>

</div>

> [!IMPORTANT]
> **为什么是「遥控本地 CLI」而不是调 API？**
> 很多人用的是 Claude 订阅（Pro/Max）而非 API Key。Anthropic 禁止第三方工具直接使用订阅 OAuth
> 令牌（2026‑01 服务端封禁、2026‑02 写入 ToS），所以本项目一切 LLM 调用都通过驱动 **官方 `claude`
> CLI** 完成——合规、零额外成本，且完整复用你已有的会话历史与项目上下文。
> 调研详情见 [`.claude/docs/research-hermes-oauth.md`](.claude/docs/research-hermes-oauth.md)。

---

## 📸 界面预览

| 连线配置画布 | 内置交互终端 |
|:---:|:---:|
| ![连线画布](docs/screenshots/canvas.png) | ![内置终端](docs/screenshots/terminal.png) |
| 飞书群 → 路由 → 会话，拖节点连线即接入 | 多终端保活 · 贴图喂图 · 运行时扫光 |

| 意图分流 | 飞书回帖效果 |
|:---:|:---:|
| ![意图分流](docs/screenshots/intent.png) | ![飞书回帖](docs/screenshots/feishu.png) |
| 同群消息按语义走不同分支（LLM 判定） | 富文本回复并 @ 提问人 |

| 可添加的节点 | 会话节点设置 |
|:---:|:---:|
| ![节点类型](docs/screenshots/nodes.png) | ![会话节点设置](docs/screenshots/nodesetting.png) |
| 画布支持的全部节点（输入源 / 路由决策 / 执行 / 技能） | cwd · 主客权限 · baseSessionId · 安全态势一览 |

| 审计留痕 | 对话样例（触发打包 + 人格回复） |
|:---:|:---:|
| ![审计](docs/screenshots/shenji.png) | ![对话样例](docs/screenshots/feishu2.png) |
| 谁(主人/访客)问了什么、命中哪个会话——只读不可改 | 触发 CI 打包 → 按所连人格口吻回帖、标注作答会话 |

| 📖 文档查看器（独立窗口） |
|:---:|
| ![文档查看器](docs/screenshots/md_html_fileviewer.png) |
| 按各会话项目目录把 `.md` / `.html` 排成目录树，右侧渲染（公共 `reports` 目录也在内）——可边看文档边继续操作主窗 |

| 📊 用量看板 · 活动统计 · 今日宜忌 |
|:---:|
| ![用量与统计](docs/screenshots/stats.png) |
| 顶栏一眼看订阅用量 / 上下文余量；活动小标悬停=本月日历热力图 + 全量统计（常用模型 / 总 token / 连续活跃…）+ 开发版「今日宜忌」黄历（图一乐）。全部读本地缓存、不耗 token |

---

## ✨ 亮点功能

| | |
|---|---|
| 🎛️ **连线式画布（独立窗口）** | 飞书群 → 路由 → Claude 会话，拖节点连线即完成接入；画布独立成单独 OS 窗口，主窗 = **欢迎仪表盘（节点总览 + 月历 + 订阅用量 + 成本排行）+ 终端**，两窗经引擎实时同步 |
| 🔀 **多群多会话 + 意图分流** | 不同群路由到不同项目（各自 cwd/模型/权限）；同群消息按语义意图走不同分支 |
| 🛡️ **主人 / 访客隔离** | 主人可让 Claude 改代码、执行命令；访客走 **fork 脱敏分身**、回复**二次脱敏** + 安全护栏——你的开发上下文与访客的会话互不污染（敏感操作审批见下条） |
| 🔐 **工具审批卡** | 访客触发改文件 / 命令等敏感工具 → 群里弹交互卡，主人 [允许 / 拒绝]，点「允许」才执行；裁决或 100s 超时后卡片**自动更新状态、去掉按钮**。审批默认开（兜底放开的访客护栏） |
| 📊 **自助命令** | `/status` 状态卡（传输/模型/cwd/git 分支/会话数）· `/doctor` 自检 · `/retry` 重跑上一条 · `/continue` 续跑，仅主人可用 |
| 📄 **飞书富交互** | 读 **docx / Wiki / Sheets / 多维表** 喂上下文；**读消息里的文件附件**（含被引用消息——文本类自动内联正文、其余落地让 Claude 用 Read 打开）；长回复自动转**飞书文件**回传（不撑爆气泡）；回复含 Markdown 表格 → 飞书**原生表格**；执行中**逐工具进度**流式卡（正在 运行命令 / 读取文件…） |
| 🖥️ **内置交互终端** | 双击节点打开开发会话（完整历史回放）；多终端保活·拖拽排序、剪贴板贴图喂图、**字号缩放（设置滑杆 / Ctrl±）** |
| 📖 **文档查看器** | 独立窗口浏览各会话项目目录下的 **`.md` / `.html`**：按**目录树**归置、Markdown 渲染（含原始 HTML / 本地图片）、HTML 沙箱原样显示；公共 `reports` 目录也并入——**可边看文档边继续操作主窗** |
| 🎭 **赋能节点（人格 / 技能 / 子代理）** | SOUL.md（性格）· SKILL.md（操作规范）· Claude Code 原生 subagent（独立上下文做重活）都做成可连线节点，连到会话赋能口即生效，一格可共享多会话；改完点「**重锚**」一键刷新到所连会话（留记忆） |
| 🌐 **中英双语界面** | 设置里一键切换 中文 / English；技术标识符（sessionId/cwd 等）保持原样，漏译自动回退中文 |
| ⏰ **定时 / Webhook / 群记忆 / 知识收件箱** | 自然语言建定时任务、外部触发、按群积累记忆、问答沉淀规则待裁决 |
| 🔁 **循环（自主多轮）** | 对一个会话**反复跑**直到命中完成标记 / 满轮数 / 超预算才停；每 N 轮**重置上下文**（靠工作目录 STATE.md 续接）防膨胀；每轮指令**实时镜像**进转录；可另出**详细 md / html 报告**；运行中可**强制中断 / 继续**；**运行时环境变量**（只注入本循环会话，当项目 hook 的开关用）；配置可**导出 / 导入**（让人或 Claude 把文件改好再一键套用）。全程 L1 只报告，破坏性操作仍走审批 |
| ✨ **运行时动效** | 启动闪屏、节点链路流线（只点亮真实路径，多群并发各自点亮）、会话扫光（fork 蓝 / 终端绿 / 双跑彩）、完成小红旗、桌面完成小人 |
| 🔄 **自动更新** | 内置 Tauri 官方更新器（minisign 签名校验，≠代码签名）；有新版自动提示、一键下载更新并重启；也可手动「检查更新」 |
| 📋 **审计 + 绿色部署** | 谁在哪个群问了什么全部落盘；单实例防重开、关窗即净退；Tauri 打包（便携版两 exe / 可自动更新版为 NSIS 安装包） |

**节点类型一览**

| 🟢 飞书群 | 🟣 路由 | 🟠 意图分流 | 🔵 Claude 会话 | 🩵 定时 | 🔁 循环 | 🟡 Webhook | 🎭 人格 | 🧩 技能 | 🦾 子代理 |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 入口·按 chatId | 加前缀/去@ | LLM 语义分支 | 落到本地会话 | cron 触发 | 自主多轮 | 外部 HTTP | SOUL.md | SKILL.md | 原生 subagent |

> 🎭人格 / 🧩技能 / 🦾子代理 是「赋能节点」：拖到会话的**人格/技能/子代理口**即作用于该会话的飞书回复（人格管怎么说话、技能管怎么做事、子代理在独立上下文做重活）。一个赋能节点可共享给多个会话。

### 🔁 循环节点 ≠ 官方 `/loop`

Claude Code 已内置 `/loop` / `/goal`（2026-06 起）——「让会话转起来」不再稀缺。本项目的循环节点做的是官方没有的四件：

| | 官方 `/loop` | 本项目 🔁 循环节点 |
|---|---|---|
| ✅ **验收闸（maker-checker）** | 会话自己说完成就算完成 | 命中完成标记后，先由**独立便宜模型**读 原任务 + STATE.md + 最近产出 判 done / not-done；未过则带理由继续——专治「糊弄完成条件」 |
| 📱 **飞书实时镜像** | 只在终端里看 | 每轮指令 / 回复实时进转录 + 飞书群，人在手机上就能盯夜跑 |
| 💰 **预算护栏** | 主要靠轮数 | 轮数硬上限（≤500）+ **美元预算**（maxCostUsd）+ 随时**强制中断**——三重独立刹车 |
| 📊 **舰队看板** | 无 | 主窗仪表盘统一看所有循环的 状态 / 轮数 / 花费，一键 跑 / 续 / 停 |

> 两者不冲突：坐在终端前手动干活，用官方 `/loop`；无人值守、要在群里盯进度、要验收和刹车，用循环节点。

---

## 🧠 它是怎么工作的

### 总体数据流

```mermaid
flowchart TD
    A["💬 飞书群 · @机器人提问"]
    subgraph BR["⚙️ bridge 引擎 · oblivionis-bridge.exe"]
        B["index.ts 主循环<br/>判主人 / 访客 · 审计落盘"] --> C["router.ts 图路由"]
        C -->|"条件边 = 意图"| D["classify-intent<br/>haiku 无状态分类"]
        D --> C
        C --> E["session-manager<br/>两会话模型"]
        E -->|"飞书一律走"| F["脱敏分身 fork<br/>注入 人格·技能·子代理 / 护栏 / 群记忆"]
        F --> G["claude-session<br/>spawn 官方 claude CLI"]
    end
    A -->|"WebSocket 长连接"| B
    G -->|"回复 · 访客二次脱敏"| H["📨 飞书富文本回帖 · @提问人"]
    E -.->|"开发只用·永不被污染"| I["🖥️ 原始会话 base · 内置终端"]
    GUI["🪟 桌面 App · React + Tauri"] <-->|"ws://127.0.0.1:8920"| B
```

### 两会话模型 + 人格（Soul / Fork）

一个「Claude 会话」节点背后是 **两条 claude 会话**，飞书永远只碰 fork：

```mermaid
flowchart LR
    FS["💬 飞书群 @机器人"]
    SOUL["🎭 人格节点 · SOUL.md"]
    subgraph CS["🔵 Claude 会话节点"]
        BASE["原始 base<br/>你的开发终端会话"]
        FORK["脱敏分身 fork<br/>飞书消息一律走这条<br/>注入 护栏 / 群记忆 / 人格·技能·子代理"]
    end
    FS -->|消息入站| FORK
    SOUL -->|"人格口（作用于飞书回复）"| FORK
    FORK --> OUT["出站二次脱敏 → 回帖"]
    BASE -.->|"永不被飞书碰"| TERM["软件内置终端做开发"]
```

- **base**：软件里的开发终端会话。飞书永不续接它（避免污染开发上下文），不注入人格/护栏。
- **fork**：从 base fork + 抹密钥而来。**所有飞书消息（主人+访客）都走它**；赋能节点（人格 / 技能 / 子代理）、访客护栏、群记忆都注入这条。

### 一条消息的旅程

```mermaid
sequenceDiagram
    autonumber
    participant U as 群成员
    participant F as 飞书
    participant B as bridge 引擎
    participant C as claude CLI
    U->>F: @机器人「打包角色管线」
    F->>B: im.message.receive_v1
    B->>B: 判主人/访客 · 审计落盘
    B->>C: 意图分类(haiku) → 命中「打包」分支
    B->>C: spawn claude -p --resume (fork sid)
    C-->>B: stream-json 事件（实时广播给 GUI）
    B->>B: 访客回复二次脱敏
    B->>F: 富文本回帖 · @提问人
    F->>U: 收到回复
```

---

## 🚀 快速开始

### 1. 环境要求

- Windows 10/11
- [Node.js](https://nodejs.org) ≥ 20 + pnpm（`npm i -g pnpm`）
- Rust 工具链（[rustup](https://rustup.rs)，构建桌面壳用）
- 已登录的 [Claude Code](https://claude.com/claude-code) CLI（`claude` 在 PATH 里）

<details>
<summary><b>📋 飞书企业自建应用机器人配置（点开）</b></summary>

- **收发与读资源权限**：`im:message` / `im:message:send_as_bot` / `im:chat` / `im:resource`
- **显示发送者真实姓名**：`contact:user.base:readonly`（并把「通讯录权限范围 / 数据范围」设为包含相关成员，否则查名返回 400）。
  > 不加也能跑——会退回用群成员列表（`im:chat`）取名，再不行才显示 open_id。
- **事件订阅**：选 **长连接（WebSocket）** 并订阅 `im.message.receive_v1`（无需公网回调）
- 添加「机器人」能力并发布

</details>

### 2. 构建

```bash
pnpm install
cd packages/bridge && pnpm package                    # 引擎打包成 sidecar exe
cd ../../apps/desktop && pnpm tauri build --no-bundle  # 构建桌面应用
```

产物组成绿色版（放进同一目录）：

| 文件 | 说明 |
|---|---|
| `apps/desktop/src-tauri/target/release/oblivionis-desktop.exe` | 主程序（改名随意） |
| `apps/desktop/src-tauri/binaries/oblivionis-bridge-x86_64-pc-windows-msvc.exe` | 引擎 sidecar，改名 `oblivionis-bridge.exe` |

> 💡 日常开发用根目录 **`rebuild-deploy.bat`** 一键完成 构建 → 部署 → 重启；热重载用 `cd apps/desktop && pnpm tauri dev`。

### 3. 配置（全部在 GUI 内完成）

1. 启动应用 → 顶栏「飞书」→ 填 App ID / App Secret → 连接（状态灯转绿 = 长连接建立）。Secret 会存进**系统凭据管理器**，不落明文 `config.json`
2. 画布连线 **飞书群 → 路由 → Claude 会话**（机器人入群后发条消息，顶部会弹「未路由 chatId」横幅，可一键建群节点）
3. 会话节点填项目目录 `cwd` 和 `baseSessionId`（点「列出该目录的会话」从历史里选）——`baseSessionId` 就是双击节点在终端里打开的开发会话；访客消息自动 fork 一份脱敏分身
4. 「飞书」面板把自己设为 owner（支持手机号/邮箱查 openId）
5. 群里 @机器人 即可。改动自动保存到 `~/.oblivionis/config.json`

---

## 🗂️ 仓库结构

```
OblivionisAgent/
├─ packages/
│  ├─ shared/              # 两端共享契约：配置 schema(zod)、WS 协议、stream-json 类型
│  └─ bridge/              # 引擎(Node)：飞书长连接、路由、会话管理、fork 脱敏、审计
│     └─ src/
│        ├─ index.ts       #   主循环：入站→主客判定→路由→会话→出站脱敏→回帖
│        ├─ router.ts      #   图路由 + 意图条件边
│        ├─ claude/        # ★ 驱动 claude CLI 的核心（两会话模型/执行器/fork脱敏/意图分类）
│        ├─ secrets.ts     #   密钥收集与脱敏
│        ├─ secret-store.ts #  飞书 App Secret 运行时持有（来自凭据管理器，不落盘）
│        └─ transport/     #   飞书长连接 / mock
├─ apps/desktop/           # 桌面应用(Tauri v2 + React 18)
│  ├─ src/App.tsx          #   主界面：画布状态/配置同步/终端管理
│  ├─ src/canvas/          #   React Flow 画布与节点卡片
│  ├─ src/i18n/            #   中英双语（中文原文即 key，漏译回退中文）
│  ├─ src/panels/TerminalsHost.tsx  # ★ 交互式终端(多终端保活/贴图/快捷键)
│  ├─ src-tauri/src/lib.rs # ★ Rust：PTY、贴图落盘、路径打开、sidecar 拉起、凭据管理器
│  └─ src-tauri/examples/  #   PTY 调试探针(抓字节/测按键序列)
├─ rebuild-deploy.bat      # 一键构建+部署
├─ CLAUDE.md               # Claude Code 项目说明(打开仓库自动加载)
└─ .claude/docs/           # ★ 知识库：架构地图/踩坑记录/工作流/选型研究
```

**Fork 后二次开发请先读 [`.claude/docs/`](.claude/docs/)**：

| 文档 | 内容 |
|---|---|
| [architecture.md](.claude/docs/architecture.md) | 数据流图 + 每个核心文件干什么（**地图**） |
| [conventions.md](.claude/docs/conventions.md) | 代码规范 / 约定 / 安全硬约束（**写代码前读**） |
| [extending.md](.claude/docs/extending.md) | **加功能 step-by-step 配方**：加节点 / 命令 / 面板 / 消息 / transport / i18n |
| [pitfalls.md](.claude/docs/pitfalls.md) | 全部踩坑记录（会话路径编码、PTY 竞态、xterm 渲染、Windows 编码…） |
| [workflows.md](.claude/docs/workflows.md) | 构建/调试/冒烟测试/接新群的标准流程 |
| [research-hermes-oauth.md](.claude/docs/research-hermes-oauth.md) | 选型研究与订阅合规依据 |

> 用 Claude Code 打开本仓库会自动加载 `CLAUDE.md`，AI 辅助二次开发体验最佳。

---

## 🔐 安全模型

| 措施 | 实现位置 |
|---|---|
| 订阅合规：只驱动官方 CLI，不碰 OAuth 令牌 | 整体架构 |
| 飞书 App Secret 存 **Windows 凭据管理器**，不明文落 `config.json`、不经 WS 广播 | `secret-store.ts` + `src-tauri/lib.rs` |
| 访客会话 fork 自开发会话，transcript 密钥替换为 `[REDACTED]` | `fork-prepare.ts` |
| 访客回复出站前二次脱敏 | `index.ts` + `secrets.ts` |
| 访客护栏 system prompt（严禁泄露密钥/凭据/敏感文件/权限/个人信息） | 配置 `guestGuardrail` |
| 访客敏感操作（改文件/命令）经主人**飞书审批卡**放行；fork 专属 `ask` 规则兜底全局 `allow` | `perm/` + `~/.oblivionis/fork-settings.json` |
| 主人/访客分级 permission mode | 会话节点配置 |
| 全量入站审计 `~/.oblivionis/audit.jsonl` | `index.ts` |

> [!NOTE]
> exe / 安装包**未做代码签名**：首次打开 Windows SmartScreen 会拦——点「**更多信息 → 仍要运行**」即可。这是未签名导致的正常拦截，不影响功能与安全。

---

## 📜 License

[**GNU General Public License v3.0（GPL-3.0）**](LICENSE) —— 自由软件、强 copyleft：**任何人可自由使用、修改、再分发，甚至商用**；但只要**分发**（含打包成 exe 给别人），就**必须以 GPL-3.0 继续开源、并提供（含你改动的）完整源码**。不允许把它改成闭源专有产品。

**Copyright © 2026 Derek·JW·Chen** — Licensed under GPL-3.0.

成品捆绑的第三方开源组件的许可证与版权声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)（随发行物分发；`node scripts/gen-notices.cjs` 可重新生成）。其中含 5 个 MPL‑2.0 弱 copyleft 组件（Tauri 的 CSS 解析链，未改动即可使用）。
