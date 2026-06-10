# 选型研究：为什么不用 Hermes / 为什么必须遥控官方 CLI

（项目启动期的调研结论，2026-06，保留出处备查。这是整个项目"路径 B"架构的依据。）

## 结论

- **要用"订阅登录态"驱动 Claude，唯一合规且能用的路径是"遥控官方 `claude` CLI"**（本项目称"路径 B"）。
- Hermes（NousResearch/hermes-agent）能连飞书、能跑 Windows 原生，但它把 Claude 当作
  自己的 LLM provider 来调——**用订阅 OAuth 令牌喂给第三方客户端这条路已被 Anthropic
  在 2026-01 服务端封禁、2026-02 写进 ToS 禁止**。Hermes 只剩"飞书传输层"的价值，
  而那部分自建更可控、可打包分发。
- 因此自建轻量 Bridge 直驱本地 `claude` CLI。

## 关键事实（均已核实）

| 事实 | 来源 |
|---|---|
| 2026-01-09 Anthropic 服务端封禁订阅 OAuth 令牌在"官方 CLI 之外"使用；2026-02-19 ToS 明确订阅令牌仅限 Claude Code 与 Claude.ai | [The Register](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/) |
| Hermes 的 OAuth 接入被导向 `extra_usage` 计费池（需 Max + 额外付费额度），否则 402 | [hermes #12905](https://github.com/NousResearch/hermes-agent/issues/12905) / [#15080](https://github.com/NousResearch/hermes-agent/issues/15080) |
| 官方 CLI 无头驱动：`-p --output-format stream-json --verbose`，`--resume <id>` 续接，`--session-id <uuid>` 指定 | [code.claude.com/docs/headless](https://code.claude.com/docs/en/headless) · 本机实测 |
| 会话落盘：`%USERPROFILE%\.claude\projects\<编码cwd>\<session-id>.jsonl` | [agent-sdk/sessions](https://code.claude.com/docs/en/agent-sdk/sessions) · 本机实测 |
| `claude -p ... stream-json` 输出 `apiKeySource:"none"` = 订阅登录态（非 API Key） | 本机 claude 2.1.156 实测 |

## 设计取舍备注（首版）

- **一条消息一次 `claude -p`（而非常驻进程）**：最稳、最简单、天然串行。
  未来可切 `--input-format stream-json` 常驻进程省启动开销。
- **prompt 走 stdin**：彻底规避 Windows 命令行引号/转义问题。
- **会话续接**：transcript 存在→`--resume`，否则 `--session-id` 新建（详见 pitfalls.md A2）。
- **飞书传输层可插拔**：lark 长连接（生产）/ mock stdin（调试），无公网回调依赖。
