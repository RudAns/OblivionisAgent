# 安全策略 / Security Policy

OblivionisAgent 把飞书消息接进本地 Claude Code 会话，天然处于敏感位置（凭据、会话历史、远程触发本地 CLI）。请认真对待漏洞。

## 报告漏洞 / Reporting a Vulnerability

**请勿**用公开 Issue 报告安全问题。

请通过 GitHub 的 **私密漏洞报告**（仓库 → *Security* → *Report a vulnerability* / Private vulnerability reporting）提交。
我们会在合理时间内响应、确认，并在修复后再公开披露。

> Please **do not** open public issues for security problems.
> Use GitHub's **private vulnerability reporting** (repo → *Security* → *Report a vulnerability*).

## 支持范围 / Supported Versions

项目处于早期（`0.x`）。仅对 `main` 分支与最新发布版提供安全修复。

## 威胁模型与设计红线（贡献者必读）

这些是**不可削弱**的安全不变量，改动碰到它们必须在 PR 里说明理由：

1. **只遥控官方 `claude` CLI，绝不拿订阅 OAuth 令牌直连 API。** 直连 = 用户封号风险。
2. **两会话隔离**：开发会话（`baseSessionId`）只属于软件内终端；所有飞书消息（含主人）一律走 fork 出的脱敏分身（`sessionId`），永不直接命中开发会话。
3. **访客脱敏链路**：fork 时 transcript 抹密钥（`fork-prepare.ts`）；访客回复出站前二次脱敏（`redactText`）。不要绕过。
4. **App Secret 只存 OS 凭据管理器**（Windows Credential Manager），不写盘、不经 WS 广播；`config-store.save` 会兜底清空 config.json 里的明文密钥字段。
5. **失败即关闭（fail-closed）**：未配置主人 = 所有人只读；配置解析失败 = 抛错而非降级放行。
6. **敏感操作走审批**：访客触发的敏感动作出飞书审批卡片，fork 级 `ask` 规则兜底全局 `allow`。

细节见 [`.claude/docs/architecture.md`](.claude/docs/architecture.md) 与 [`.claude/docs/conventions.md`](.claude/docs/conventions.md)。

## 用户自我保护建议

- 不要把 `~/.oblivionis/config.json`、会话 transcript（`~/.claude/projects/...`）发给任何人——里面可能有未脱敏的本地上下文。
- App Secret 配置后即写入系统凭据库；不要再手动往 config.json 里填明文密钥。
- 仅把可信飞书群接入；访客权限默认最小化。
