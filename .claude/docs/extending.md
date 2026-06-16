# 如何扩展（加功能配方）

> 每个配方 = **动哪些文件 + 顺序 + 坑**。配合 [architecture.md](architecture.md)（地图）+ [conventions.md](conventions.md)（规范）看。
> 每改完都按 [conventions.md 自检清单](conventions.md#提交前自检清单) typecheck / build。

---

## 配方 1 · 加一种新节点类型

以现有 `skill` / `subagent` 节点为参照。**漏一处节点就半残**，按顺序动：

1. **`packages/shared/src/config.ts`** — 加 `kind` 的 `z.literal("新kind")` + 对应 `Data` schema，并入 `GraphNode` union（导出类型）。**改配置结构永远从这开始**。
2. **`apps/desktop/src/App.tsx`**：
   - `NEW_NODE_DEFAULTS` — 新建时的默认 `data` + `label`
   - `PALETTE` — `[kind, 中文名]`（`NODE_LABEL`、Ctrl+K、右键菜单都由它派生）
   - `ADD_GROUPS` — 「＋ 添加节点」下拉里加一项（`icon` / `color`）
   - `NODE_COLOR` / `NODE_ICON` — 节点检视浮窗头用
   - Inspector（`Inspector` 组件）里加 `node.type === "新kind"` 的编辑区
   - 若有专属文件 / 动作：加 `onEditXxx` 并经 WS 发消息
3. **`apps/desktop/src/canvas/nodes/XxxNode.tsx`** — 节点卡片，基于 `NodeShell`。
4. **`apps/desktop/src/canvas/FlowCanvas.tsx`**：
   - `nodeTypes` 注册组件
   - `NODE_COLORS` 缩略图配色
   - `isValidConnection` 连线规则（谁能连谁、落哪个 `targetHandle`）
5. **若是「赋能节点」**（连到会话、作用于飞书 fork，像 soul/skill/subagent）：
   - bridge 加 `xxx-store.ts`（`readXxx` / `resolveSessionXxx` / `ensureXxx`）
   - `bridge/index.ts` `handleInbound` 里把它注入 `appendPrompt`
   - `bridge/server.ts` + `shared/protocol.ts` 加 `ensure-xxx` 消息（GUI 点「编辑」时播种文件）
   - `canvas/edges/ConditionEdge.tsx` 想要赋能虚线就在 `sourceKind` 判定里加
6. **`apps/desktop/src/i18n/en.ts`** — 新文案翻译。

⚠️ 坑：节点 `data` 默认值**别**给 `sessionId` / `baseSessionId` 空串（见 pitfalls B1）。

---

## 配方 2 · 加一个自助命令 `/xxx`

只动 **`packages/bridge/src/index.ts`**：在 `handleInbound` 顶部的命令正则分支里加 `/xxx`。仅主人可用就判 `isOwner`。回卡片用 `gateway.transport.sendCard`，回退用 `reply`。

---

## 配方 3 · 加一个 GUI↔bridge 消息

1. **`shared/protocol.ts`** — `ClientMessage`（GUI→bridge）或 `BridgeMessage`（bridge→GUI）加类型。
2. **`bridge/server.ts`** — `onClientMessage` 的 `switch` 加 `case`（复杂逻辑挂 `ServerDeps`，在 `index.ts` 注入实现）。
3. **`apps/desktop/src/App.tsx`** — `client.send({ type: "…" })` 发；`onMessage` 收。

---

## 配方 4 · 加一个面板（右侧/底部视图）

1. **`apps/desktop/src/panels/XxxPanel.tsx`**。
2. **`App.tsx`** — `Tab` 类型加值；面板区按 `tab` 渲染；`TAB_TITLE` / `TAB_DESC` 加标题与说明。
3. **`IconRail.tsx`** 加入口（或塞进某面板顶部小页签，如「转录 / 服务日志」那样坍缩）。

---

## 配方 5 · 加一个 transport（对接别的 IM / 通道）

实现 `bridge/src/transport/transport.ts` 里的接口（`onMessage` / `reply` / `replyStream` / `sendCard` …），在 `index.ts` 的 `connect()` 里按条件选用（参照 `lark-transport.ts` / `mock-transport.ts`）。出站脱敏、@提问人这些由公共流程处理，transport 只管收发。

---

## 配方 6 · 给 fork 注入新东西（护栏 / 记忆 / 上下文）

fork 的 system prompt 在 `bridge/index.ts` `handleInbound` 里拼 `appendPrompt`（顺序：人格 → 群记忆 → 节点 appendSystemPrompt → 技能 → 子代理 → 访客护栏压轴）。要加新的注入项，在这拼即可——**访客护栏永远压轴**，别插它后面。

---

## 配方 7 · 加 Rust 原生能力（PTY / 文件 / 系统集成）

1. **`src-tauri/src/lib.rs`** — 写 `#[tauri::command] fn xxx(...)`，注册进 `generate_handler!`。
2. 前端 `invoke("xxx", { … })` 调用。
3. spawn 子进程记得 `CREATE_NO_WINDOW`；涉密用 `keyring`。

---

## 配方 8 · 加 i18n 文案

包 `t("中文")`（事件回调用 `tStatic`）+ 往 `i18n/en.ts` 加一行 `"中文": "English"`。技术标识符 / 品牌名不翻。详见 [conventions.md i18n 节](conventions.md#i18n界面国际化)。

---

> 终端（`TerminalsHost.tsx` + `lib.rs`）是坑最密集区，动它前**务必**先读 [pitfalls.md C 节](pitfalls.md)，并善用 [workflows.md 的 PTY 探针](workflows.md)先抓原始字节。
