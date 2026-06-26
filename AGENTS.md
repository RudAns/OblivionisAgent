# AGENTS.md

本仓库面向 **AI 代理 / 编码助手**（Claude Code · Codex · Cursor · …）的规范，**单一事实源是 [`CLAUDE.md`](CLAUDE.md)**——别再另起一份会逐渐漂移的规则。任何 agent 进来，先读它。

- **项目说明 + 不可违反的硬约束**（只遥控官方 `claude` CLI、两会话模型、访客脱敏…）：见 [`CLAUDE.md`](CLAUDE.md)。
- **架构地图 / 加功能配方 / 踩坑库 / 工作流**：见 [`.claude/docs/`](.claude/docs/)（CLAUDE.md 里有同一张导引表）。
- **提交前自检**：`pnpm -r typecheck` · 桌面 `pnpm --filter @oblivionis/desktop build` · Rust 侧 `cargo clippy -- -D warnings`（在 `apps/desktop/src-tauri/`）· 依赖合规 `cargo deny check`。

> 为什么是指针而非副本：避免 CLAUDE.md / AGENTS.md / IDE rules 各写一份、互相漂移。改规范只改 `CLAUDE.md` 一处。

@CLAUDE.md
