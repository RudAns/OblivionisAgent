# 代码规范与约定

> 改代码前读这篇 + [architecture.md](architecture.md)（地图）。加功能照 [extending.md](extending.md) 的配方。

## 目录边界（最重要，别越界）

- **`packages/shared` = 唯一契约层**。只放 zod 配置 schema / WS 协议 / stream-json 类型。**绝不 import `bridge` 或 `desktop`**——它被两端 import，反向依赖会造成循环。改配置或协议结构**从这里开始**，两端自动拿到类型。
- **`packages/bridge` = Node 引擎**。不碰 DOM / React。所有 LLM 调用都 spawn 官方 `claude` CLI。
- **`apps/desktop` = Tauri v2 + React 前端 + Rust 壳**。前端**不直接读** `config.json`，一律经 WS 从 bridge 拿（`store.get()` 广播）。

## 安全硬约束（违反 = 用户封号 / 泄密；细节见 [CLAUDE.md](../../CLAUDE.md)）

1. **只 spawn 官方 `claude` CLI**，绝不直连 API、不碰订阅 OAuth 令牌。
2. **两会话模型**：飞书消息（含主人）一律走 fork 脱敏分身；`base` 开发会话永不被飞书碰。
3. **访客脱敏链**：访客回复出站二次脱敏（`redactText`）；fork 时 transcript 抹密钥（`fork-prepare.ts`）。别削弱。
4. **App Secret 只存 OS 凭据管理器**：绝不写盘、不经 WS 广播（`config-store.save` 会兜底清空 `feishu.appSecret`）。
5. **访客敏感操作走飞书审批卡**（`perm/`）；fork 专属 `ask` 规则兜底全局 `allow`。
6. 安全相关一律 **fail-closed**：没设主人 = 所有人只读；配置解析失败 = 直接抛（宁崩不带病运行）。

## TypeScript

- `strict` + `noUncheckedIndexedAccess` 全开（`tsconfig.base.json`）。
- 命名：函数 / 变量 `camelCase`；类型 / React 组件 `PascalCase`；文件 `kebab-case`（React 组件文件用 `PascalCase`）。
- **zod schema 是配置的唯一真源**（`shared/config.ts`），类型从 schema 推导，别手写重复 interface。
- 尽量不用 `any`；读 `node.data` 这类动态配置用局部 `as { … }` 窄化。
- 异步 / 事件回调里的用户可见文案用 `tStatic`（读 localStorage，避开闭包里 `t` 过期）；组件渲染里用 `useT()`。

## WS 协议 & 配置 schema 契约

- **加 GUI↔bridge 消息**：先在 `shared/protocol.ts` 定义类型 → bridge `server.ts` 处理 → 前端 `App.tsx` 收 / 发。两端共享类型 = 永不对不上。
- **加配置字段 / 节点种类**：从 `shared/config.ts` 的 zod schema 开始（见 extending 配方 1）。
- 别把 `sessionId` / `baseSessionId` 写成空串（schema 已加固"空串=未设置"，但别依赖它）；清空会话用 GUI 的「刷新快照」。

## i18n（界面国际化）

- **中文原文即 key**：`t("中文")`，英文在 `i18n/en.ts` 查表，**漏译自动回退中文**（所以可逐屏补，不会空白）。
- 组件渲染用 `useT()`；当 `map` 变量已占用 `t`（如 `TerminalsHost`）改用 `tr`；class 组件 / 模块 / 事件回调用 `tStatic`。
- 占位插值 `{0}{1}`：`t("会话 {0} · 终端 {1}", a, b)`。
- **不翻**：技术标识符（`sessionId`/`cwd`/`fork`/`PTY`/权限模式名）、品牌名、代码块、SOUL.md 等用户数据。语言切换器本身固定双语（不走 `t`）。

## Rust（`src-tauri/src/lib.rs`）

- 原生能力都是 `#[tauri::command]`，注册进 `generate_handler!`。
- spawn 子进程必带 `CREATE_NO_WINDOW`，否则闪黑窗（见 `open_path`）。
- 凭据用 `keyring` crate（Windows 凭据管理器）。
- 单实例插件**必须第一个注册**；只在 **main 窗** `Destroyed` 时杀 sidecar + `app.exit(0)`（别误杀闪屏/小人窗触发的销毁）。

## CSS / 主题 / 终端

- 颜色走 CSS 变量（节点色 `--nc`，主题 `--accent`/`--text`/`--border`…），随 `data-theme` 切换，别硬编码颜色。
- **xterm 三件套锁 beta**（`@xterm/xterm` `addon-webgl` `addon-fit` 版本必须配对），原因见 pitfalls C7，别擅自升。

## Windows 专属

- `.bat`/`.cmd` 必须 **CRLF + 纯 ASCII**（GBK 码页 + LF 会整文件解析错乱）。
- spawn `claude` 要过 `cmd.exe`（见 pitfalls D2）。

## 注释

- 中文注释，解释 **WHY**（为什么 / 踩过什么坑），不复述 WHAT。
- 踩过的坑在代码旁留一句并指向 [pitfalls.md](pitfalls.md) 对应条。

## Commit 规范

- Conventional Commits + 中文描述：`feat(scope): 说明` / `fix(desktop): …` / `refactor: …` / `docs: …` / `chore: …` / `style(desktop): …`。常用 scope：`desktop` `bridge` `security` `readme`。
- 正文列要点；AI 辅助则结尾带 `Co-Authored-By:`。
- **只在用户要求时 commit / push**；提交前先 typecheck / build 过。

## 提交前自检清单

```bash
pnpm --filter @oblivionis/bridge typecheck     # 引擎 TS
cd apps/desktop && npx tsc --noEmit && npx vite build   # 前端
cd apps/desktop/src-tauri && cargo check       # Rust
node scripts/gen-notices.cjs                   # 若动了依赖，刷新第三方声明
```
