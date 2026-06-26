# 贡献指南 / Contributing

欢迎二次开发、加功能、修 bug。本项目用 **Claude Code** 开发，知识库都在 [`.claude/docs/`](.claude/docs/)——用 Claude Code 打开仓库时 [`CLAUDE.md`](CLAUDE.md) 会自动加载，让 AI 辅助加功能体验最佳。

## 快速上手

1. **环境 + 构建**：见 [README · 快速开始](README.zh.md#-快速开始)。
2. **改代码前按需读**（也是「文档地图」，CLAUDE.md 里有同一张表）：

   | 想干什么 | 看哪篇 |
   |---|---|
   | 搞懂数据流 + 每个核心文件干什么 | [architecture.md](.claude/docs/architecture.md) |
   | 写代码前的规范 / 约定 / 安全硬约束 | [conventions.md](.claude/docs/conventions.md) |
   | **加功能的 step-by-step 配方** | [extending.md](.claude/docs/extending.md) |
   | 改终端 / 会话 / 配置前必查的踩坑库 | [pitfalls.md](.claude/docs/pitfalls.md) |
   | 构建 / 调试 / 冒烟测试 / 接新群 | [workflows.md](.claude/docs/workflows.md) |

   > 让 AI 加功能时，先让它读 **architecture（地图）+ extending（配方）+ conventions（规范）** 再动手。

## 几条不可破的红线（详见 [conventions.md](.claude/docs/conventions.md)）

- 只 spawn 官方 `claude` CLI，**绝不直连 API / 碰订阅 OAuth 令牌**。
- 飞书消息一律走 **fork 脱敏分身**；访客回复**二次脱敏**；`base` 开发会话永不被飞书碰。
- **App Secret 只存 OS 凭据管理器**，不写盘、不广播。

## 提交前自检

```bash
pnpm --filter @oblivionis/bridge typecheck            # 引擎 TS
cd apps/desktop && npx tsc --noEmit && npx vite build  # 前端
cd apps/desktop/src-tauri && cargo check               # Rust
node scripts/gen-notices.cjs                           # 动了依赖才需要：刷新第三方声明
```

Commit 用 **Conventional Commits + 中文描述**（`feat(scope): …` / `fix(desktop): …` / `docs: …`）。

## 许可证

贡献即同意以 **GPL-3.0** 授权你的改动（强 copyleft；分发须继续开源并提供源码）。
