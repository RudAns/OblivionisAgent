# 踩坑记录（每条都付过学费，改相关代码前先读）

## A. Claude CLI / 会话

### A1. 订阅令牌不能直连 API（最高优先级约束）
Anthropic 2026-01 起服务端封禁第三方工具使用订阅 OAuth 令牌，2026-02 写进 ToS。
**唯一合规路径 = spawn 官方 `claude` CLI**。`claude -p --output-format stream-json --verbose`
里 `apiKeySource:"none"` 即订阅鉴权。`stream-json` 必须配 `--verbose` 否则报错。

### A2. transcript 路径编码的三个坑（session-path.ts / lib.rs session_exists）
- 编码规则：cwd 绝对路径中非字母数字 → `-`（如 `C:\Users\me\proj` → `C--Users-me-proj`）。
- **坑1**：claude 落盘的目录**盘符可能是小写**（`c--Users-...`），代码里 cwd 是大写 `C:\`。
  Node `existsSync` 在 NTFS 不区分大小写所以侥幸能过；Rust 侧必须兜底**搜全部项目目录**。
- **坑2**：cwd 结尾的 `\` / `/` 要先 trim 再编码，否则多一个 `-` 永远匹配不上。
- **坑3**：对**已存在**的 id 用 `--session-id` 会报 "already in use" 错；
  规则=只要 transcript 在任何目录存在就必须 `--resume`。

### A3. fork 模式
`claude -p --resume <base> --fork-session` 会生成新会话 id（从 stream-json 的
`session_id` 字段捕获）。fork 后对 fork 的 transcript 做脱敏（抹密钥）**不影响 base 原文**。
刷新快照 = 清掉 sessionId 重新 fork。

### A4. 意图分类
用独立无状态调用：`claude -p --model haiku --tools "" --no-session-persistence
--output-format text`，回答 1..N 或 0。不要复用业务会话做分类（污染上下文+慢）。

## B. 配置 / 数据安全

### B1. 空字符串 sessionId 会炸掉整个配置（曾导致"画布全空"事故）
schema 是 `z.string().uuid().optional()`——`.optional()` 不接受 `""`。
曾手工把 sessionId 改成 `""` → 配置解析失败 → bridge 启动即崩 → GUI 拿不到图 → 画布空白。
**现已加固**（preprocess 空串→undefined），但原则：**不要手工编辑 config.json 的会话字段**，
清空走 GUI「刷新快照」。config-store 解析失败故意直接抛（宁崩不带病写盘，正是这保住了数据）。

### B2. 配置广播会覆盖画布
GUI 收到 config 广播时**只在首次**重建画布，之后只合并 sessionId——否则正在编辑的节点
位置/连线会被旧数据冲掉（曾发生）。见 App.tsx 里 graphInit 逻辑。

## C. 终端（TerminalsHost.tsx + lib.rs）——坑最密集区

### C1. ptyId 竞态：--resume 的历史会整段丢失
`pty_open` 返回前 claude 已经开始猛吐历史，而 pty-data 监听器按
`e.payload.id === ptyId` 过滤（此时 ptyId 还是 null）→ 历史被丢弃 → 终端只剩头部一行。
**修法**：earlyBuffer 先缓存，拿到 ptyId 后回放。

### C2. 启动尺寸竞态：claude 按错误宽度渲染（输入框画在 2/3 宽度处，◇ 在行中间）
挂载瞬间 fit() 量到的是布局未稳的偏小列数；布局稳定后 ResizeObserver 想补发尺寸，
但 ptyId 还是 null 被跳过 → claude 永远以为终端很窄。
**修法**：开 PTY 前等两帧 RAF 再 fit；open 返回后对账（实际列数≠打开时列数→补发 pty_resize）。

### C3. 千万不要自动做 "resize 抖动"
曾用"缩1列再恢复"逼 claude 整屏重绘来清残影——结果每次重排都在 scrollback 留残行，
首次打开打断历史回放、快速切换时残行叠加，比原病还重。
**正确做法**：隐藏(0尺寸)时跳过 fit/resize；切回时只 fit+refresh+focus，
**只有尺寸真的变了**才通知 PTY。

### C4. Shift+Enter 软换行的真实字节序（实测，别信文档/猜测）
- claude 开启 bracketed paste(`?2004h`)、focus reporting(`?1004h`)、ConPTY win32 输入(`?9001h`)；
  **没开** kitty 键盘协议、没开 modifyOtherKeys。
- `\x1b\r`（ESC+CR）单独发=软换行 ✅；但 **xterm 的 return false 挡不住浏览器 Enter 默认行为**，
  会多漏一个裸 `\r` 变成 `\x1b\r\r` = 换行后立刻提交（实测复现）。
  **必须 `e.preventDefault()`**。
- 实测工具在 `apps/desktop/src-tauri/examples/pty_nl.rs`（vte 重建终端屏幕判定换行/提交）。

### C5. Ctrl+V 粘两遍
键盘处理器手动 `term.paste()` + 浏览器原生 paste 事件各粘一次。
**修法**：Ctrl+V 分支只 `return false` 抑制 ^V，粘贴交给原生事件（图片粘贴除外，见 C6）。

### C6. 贴图
终端是纯文本通道，claude **不会**自动识别打进去的图片路径。
方案：剪贴板图片 → Rust `save_paste_image` 存临时 PNG → 路径插入输入框 →
用户提问后 claude 用 Read 工具读图（Read 原生支持 PNG/JPG）。

### C7. WebGL 中文乱码（方块/错字，切窗口就好）= 上游图集合并 bug
根因：xterm WebGL 字形图集满了做 4合1 页合并时 version 撞号 → GPU 不重传纹理 →
继续采样旧页。中文几千字形极易触发。上游修复 PR #5883（2026-05-21），
**只进了 6.1-beta/0.20-beta，没有任何 stable 包含**。
**当前方案**：三件套锁定 `@xterm/xterm@6.1.0-beta.285` + `@xterm/addon-webgl@0.20.0-beta.284`
+ `@xterm/addon-fit@0.12.0-beta.285`（VS Code 同渠道）。**等 7.0 stable 切回**。
注意 6.x 变更：`customGlyphs` 从 Terminal 选项移到了 `new WebglAddon({customGlyphs})`。

### C7a. xterm 插件的运行时雷区（tsc 查不出）
- **proposed API**：unicode 系列插件 activate 时校验 `allowProposedApi`，没开就抛错白屏。
  新加任何 xterm 插件先查它是否要求 proposed API，Terminal 构造参数加 `allowProposedApi: true`。
- **unicode-graphemes + WebGL = 翻车**（beta.285 实测）：缩放窗口黑屏、向上滚动历史重复渲染。
  **用 unicode11**（VS Code 同款组合）——emoji 宽度照样修正(✅=2列)，稳定性久经考验。
  代价：✏️ 这类 VS16 变体序列宽度仍可能差 1 列，可接受。

### C7b. 终端底部黑带的真正根因 = .xterm-viewport 默认 #000（2026-06-11 查实）
**别再刷外层容器了**——刷 .term-view/.terms-body/.terminal-host/.xterm 都没用，因为黑带不在它们身上。
机制（用 xterm 5.5.0 源码+css 查实，非猜）：
- `xterm.css` 把 `.xterm-viewport` 默认 `background-color:#000`（纯黑）。
- DOM 追加顺序：`.xterm-viewport` 先 append 到 `.xterm`，`.xterm-screen`(WebGL 画布)**后** append
  → screen 是后一个兄弟节点，绘制在 viewport **之上**。
- 画布只覆盖 `rows*cellHeight`。fit 后终端比容器矮一两行时，画布下方露出黑色 viewport = **底部黑带**（只有终端栏有）。
**正确修法**：`.terminal-host .xterm-viewport { background-color:#1b1e24 !important }`。
viewport 在画布**之下**，刷它绝不会盖住文字——这正是和下面"全黑事故"的区别。

绝不能刷的是 **.xterm-screen / canvas / 装饰层**（它们在最上层，不透明 bg 会盖住文字 → 终端全黑，实际事故）。
一句话：**viewport=底层，可刷；screen/canvas=顶层，碰不得。**
另：曾给 `.xterm-screen` 加 `height:100%!important` 强撑——WebGL 把多出来那截清成纯黑，是另一种黑带源，已删。

### C3a. 不要用 clear-before-resize 消除"缩放后历史重复"
ConPTY/Ink 在 resize 时会重打一部分内容 → 缩放后历史多一份。曾试图在发 pty_resize 前
term.clear() 让"重放成为唯一一份"——实测重放**不含完整历史**，结果 scrollback 被清空、
无法滚动，比重复更糟。结论：resize 防抖(250ms 尾沿)把 N 份降为 1 份后**接受现状**；
谁再想消那一份重复，先证明重放范围覆盖完整 scrollback。

### C8a. "─── ◇ ◇ ◇ ───" 真凶=PTY 逐块解码切断 UTF-8（已根治）
菱形其实是 **U+FFFD 替换字符**（字形=菱形）：lib.rs 读 PTY 按 4096 字节块逐块
`from_utf8_lossy`，分隔线是一长串 3 字节的 `─`，块边界必然切中某个 `─` → 残缺字节
→ 1-3 个 FFFD 连排"漂"在线上。**修法：跨块保留残缺尾字节(error_len()==None 分支)，
拼到下一块再解码**。教训：①探针拼完整 buffer 再解码所以抓不到（诊断工具的解码路径
必须和生产一致）②"乱码"先怀疑自己的解码链，再怀疑渲染器/字体。
（曾两次误判：customGlyphs 矢量画歪→关了没用；markdown hr 装饰→实测 hr 只用 ─。）

### C8. 分隔线上漂浮的 ◇ 菱形
实测（examples/pty_diamond.rs）claude 输出里 0 个菱形字符、0 次 DEC 字符集切换 →
是渲染层把制表符画歪（矢量自定义字形 × 非整数行高 1.05 × WebGL）。
**修法**：`new WebglAddon({ customGlyphs: false })` 让制表符走字体渲染（Cascadia 自带）。

### C9. claude 直播输出时的"叠印残影"（状态行两帧叠在一行、esc to interrupt 重复）
Ink TUI 用相对光标重绘，xterm/ConPTY 下行映射偶发漂移一行就会叠印。无法 100% 根除
（Windows Terminal 跑 Ink 应用也偶发）。缓解：提供手动「重绘」（一次性 resize 抖动）；
自动抖动禁止（见 C3）。

### C10a. 输入法候选框弹到屏幕右下角
xterm 用隐藏 textarea 贴在光标处给 IME 定位，但只在光标移动/resize/compositionstart 时
同步位置；窗口失焦再回来后锚点陈旧 → Windows IME 拿不到光标坐标 → 候选框退回
屏幕右下角（上游 xterm #5734 已修 compositionstart 路径，我们的 beta 已含；
WebView2Feedback #2241 仍 open）。
**app 层兜底**：window focus / visibilitychange / keyCode 229 时调私有 API
`term._core._syncTextArea()` 重新锚定，并对激活终端 blur/focus 一轮让 Chromium
重发光标矩形。升级 xterm 后注意私有 API 是否还在（代码里已做静默退化）。

### C10. 多终端保活的正确姿势
TerminalView 空依赖 `[]` 只创建一次；切换用 display:none 不卸载；
变可见时 fit 前必须确认容器尺寸非 0。**字体**：英文 Cascadia Mono，
中文 'Noto Sans SC'（Windows 上最接近 macOS 苹方），行高 1.05。

### C11. 浅色终端里鼠标 I 形指针发黑/反复变色 ≠ 应用 bug
Windows 文本光标(I-beam)随背景自动反色保证可见：深底显白、浅底显黑。终端调成近白
(`#fcfbf9`)后 I-beam 变黑；又因 Claude 把明暗块烘焙进输出，指针掠过时反复反色 → 观感"错乱"。
**这是 OS 行为（与 diff/语法色不可改同源），CSS 改不动 OS 指针颜色**。
想固定色只能上自定义 `cursor: url(<svg>)`，但固定色掠过 Claude 的同色块会看不见——
OS 的反色本就是为可见性服务，故保持现状不改。切主题后若指针/底色仍乱，先「重开终端」(WebGL 重载)。

### C12. 切主题后已开终端要重载 WebGL 才变色（beta 锁版的副作用）
仅改 `term.options.theme` 在锁定的 6.1/0.20 beta 上不会重绘 WebGL 背景。**修法**：
dispose 再 new WebglAddon（`reloadWebgl()`）。但 Claude 输出里 diff/语法是渲染当下烘焙的绝对色，
重载也救不回——故设置里给了「重开所有终端」(claude --resume 整屏重渲染)兜底。

### C13. 终端内边距绝不能放宿主容器上（claude 底部状态行被砍半，2026-07-23 查实）
FitAddon.proposeDimensions 拿 **父容器 computed height** 当可用高度（全局 border-box 下这值
**含父容器 padding**），但只会扣 **`.xterm` 元素自身** 的 padding。padding 放 `.terminal-host` 上
= 可用高度多算 12px：窗口高度余数 < 12px 时行数多算 1，最后一行（claude 的
"auto mode on · esc to interrupt" 状态行）被裁半截——余数大时又正常，表现为"有时候砍一半"。
**修法**：`.terminal-host{padding:0}`，内边距移到 `.terminal-host .xterm` 上（FitAddon 的设计用法，
它明确扣 terminal.element 的 padding）。以后想调终端留白只改 `.xterm` 那条，别碰宿主。

## D. Windows 专属

### D1. .bat/.cmd 必须 CRLF + 纯 ASCII
中文 Windows cmd 是 GBK 码页：LF 换行 + UTF-8 中文注释 → 整个文件逐行解析错乱
（满屏 "xxx 不是内部或外部命令"）。写完用 PowerShell 强转：ASCII 编码 + CRLF。

### D2. spawn claude 要过 cmd.exe
claude 实际是 `.cmd`，Rust/Node 直接 spawn 会找不到。统一
`%ComSpec% /c claude <args>` 并显式继承全部环境变量（PATH）。

### D3. PowerShell 5.1 限制
没有 `&&`/`||`；`2>&1` 重定向原生 exe 会把 stderr 包装成 ErrorRecord 假报错；
写文件默认 UTF-16，要 `-Encoding utf8`。

### D4. 端口
8787 在本机常被占用，默认用 8920。

## F. 连线画布 / 明暗主题（@xyflow + CSS 变量）

### F1. React Flow 吞掉画布上的 mousedown → document 级"点外部关闭"要用捕获阶段
给左上角「＋添加节点」下拉做"点外部关闭"时，监听 `document.mousedown`（冒泡）收不到画布上的
按下——React Flow 在 pane/node 上 stopPropagation。**改捕获阶段**
`addEventListener("mousedown", fn, true)` 才能在 RF 之前拿到，点画布也能关。
设置/飞书/节点检视那几个浮窗共用这个监听，同样需要。

### F2. 浅色配色：用户给的"书面色值" ≠ 用户给的"参考图"
踩过：照用户写的 `#F6F3EC / #F1EEE6`（偏暖米黄）忠实落地，结果跟用户的参考图
（实测近白 `#FCFBF9 / #F7F6F3`）对不上 → 用户觉得"没按图做"，反复返工。
**先用 PowerShell `System.Drawing.Bitmap` 抠参考图像素**确认真值（脚本见聊天记录）；
两者冲突时让用户拍板以哪个为准（本项目最终选"以图为准"调近白，品牌/节点色不动）。

### F3. 给元素注入 CSS 自定义属性(`--nc`)做内联样式，TS 要 `as CSSProperties`
`style={{ "--nc": color } as CSSProperties}`——`CSSProperties` 不含任意自定义属性，
直接写会报错，断言一下即可。节点/连线检视浮窗"按节点类型着色的头部"就靠它。

### F4. 节点 LOD（缩放隐藏字段）用户不要——已删
曾按"专业编辑器"惯例加：缩到 <70% 只留标题。用户明确不要（节点类型不多，全展开没问题）。
NodeShell 里已去掉 zoom/lod 分支。别照搬大编辑器惯例硬塞。

### F5. 自动布局会打乱手摆位置——已整体删除
拓扑分层 autoLayout 用户觉得"会把我摆放的搞乱"，已删函数 + 工具条按钮 + Ctrl+K 命令 + 右键项。
**别再加回**；手动摆放优先。

### F6. 终端页签/会话卡片的细节口味（都是用户逐条调出来的，别回退）
- 终端页签做成**浏览器页签**：条带略凹(`--frame`)、圆角朝上、活动页签顶部品牌色细条、
  与下方内容同色相连；支持 HTML5 拖拽排序(onReorder 重排 openedTerminals)。
- 终端视图**不显示**顶部 `panel-title`（与页签条+信息栏三重复）；信息栏只放「📁工作目录」(页签没有的)。
- 当前会话卡片：**不整卡染色**，只左侧橙→白渐变(颜色集中左半) + 4px 品牌色左条。
- 连线"意图"徽标浅色下要**白胶囊底框 + 橙字**（用户先要去底、又改回要底框，最终=有底框橙字）。
- 全界面默认 `user-select:none`，只放开终端/转录/日志/审计/输入框/路径——标题误选会妨碍点击/拖窗。

## E. 流程教训

### E1. 不要并行开多个 Claude Code 会话改同一批文件
曾导致：A 会话把终端重构成新文件 TerminalsHost.tsx，B 会话还在改旧的 TerminalPanel.tsx
（已变死代码），且 B 的 Rust 返回值改动和 A 的前端约定冲突 → 终端全黑。
**结论**：一个项目一个会话；接手前先 `grep` 确认组件真的被 import。

### E2. 调试探针的 debug 编译产物有 4GB+
`cargo run --example` 用 dev profile，会把整个依赖树带调试符号编一遍。
用完 `rm -rf src-tauri/target/debug` 即可，不影响 release 缓存。

### E3. 部署被运行中的 exe 锁住
便携版在跑时无法覆盖 exe。`rebuild-deploy.bat` 的顺序（先构建→后 taskkill→覆盖→重启）
就是为此设计，勿改成先杀进程。
