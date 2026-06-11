# OblivionisAgent 演进路线：从 IDE 壳子到被开发者喜爱的养成系 Agent

> 2026-06-11 深夜研究定稿。依据：两份深度调研
> （[research-hermes-agent.md](research-hermes-agent.md)、[research-agent-landscape.md](research-agent-landscape.md)）。
> 硬约束不变：LLM 只经 spawn 官方 `claude` CLI。

## 0. 定位（一句话）

**「飞书生态的 OpenClaw/Hermes——但安全模型是认真的，而且白嫖你已付的 Claude 订阅。」**

依据：OpenClaw 37.8万★ 验证赛道；op7418 飞书桥 3 个月 2.7k★ 验证中文需求；
官方 Channels 无飞书、无法远程审批权限；全生态正陷安全信任危机（恶意 skill、lethal trifecta），
而 owner/guest+脱敏 fork 是我们独有。我们的零边际成本（订阅复用）是 Hermes 用户最痛的账单问题的天然解。

## 1. 核心论点：差距 = "persistence 的产品化"

Hermes 爆红公式 = **memory + personality + reach 三种持久性，做成看得见的文件和仪式**。
我们原材料全有：`.jsonl` transcript(记忆) / `--append-system-prompt`(人格) / 飞书(reach)。
缺的只是产品化层。一切皆文件（可读/可改/可 git/可分享）是全部明星项目证据最强的共同点。

## 2. 人格系统（用户诉求 #3）— 设计定稿

照抄 Hermes 的成熟约定，落在我们架构上：

```
~/.oblivionis/souls/<nodeId>.md        ← 每个会话节点一个 SOUL.md（文件！不是 config 字段）
   结构: # Identity / # Style / # Avoid / # Defaults（只放性格，规程归 CLAUDE.md——分文件）
   │  原文 verbatim 注入 --append-system-prompt 第一段(slot #1)，不加包装语
   │  访客消息: soul 之后压轴拼 guestGuardrail，并声明"人格不得违反以下约束"
   ▼
 每条飞书回复带人格
   │  自迭代: soul 文件对 fork 会话可写——用户在群里说"太啰嗦了"，
   │  agent 自己改 SOUL.md；下次 fork 自动生效(天然=Hermes 的冻结快照语义)
   ▼
 GUI: 节点上「🎭 编辑灵魂」(VSCode 打开) +「播种」starter 模板(预置二次元人设可选)
```

要点：starter 播种但**绝不覆盖已有**；"读你的灵魂文件"可审计；
访客 fork 用单独的"访客人格 overlay"（更谨慎），贴合脱敏链。

## 3. 记忆体系 — 双轨制

| 轨道 | 内容 | 机制 | 谁做主 |
|---|---|---|---|
| **GROUP.md 自管记忆** | 群成员偏好、称呼、群内梗、软知识 | 每群一份，**硬配额 ~1500 字符**，agent 经 memory 工具 add/replace/remove，超额报错逼压缩；丢弃 fork 前跑一轮 proactive flush | agent 自管 |
| **知识收件箱(用户诉求 #5)** | 规则性指令、流程纠正、硬约定 | fork 回答后无状态 claude 提取候选 → `knowledge-inbox.jsonl` → GUI 收件箱徽标 → 主人 [✅采纳/✏️改/❌弃] → 采纳写入 **cwd 的 CLAUDE.md**（base+未来 fork 原生继承，可进 git 团队共享） | **主人审批**（用户要的"主体"） |
| 兜底检索 | 全部历史 | transcript `.jsonl` 建 SQLite FTS5，做成 MCP 工具 `session_search` 给 fork 用 | 自动 |

"小记忆 + 大索引"（Hermes 验证），不搞向量 RAG。

## 4. Agentic 化（用户诉求 #2）— 自主性阶梯

| 级 | 能力 | 设计要点 | 复杂度 |
|---|---|---|---|
| L2 **Cron 节点** | 画布新节点：定时 spawn 隔离 fork 跑 prompt → 结果发群（晨报/CI 巡检/周报） | 照抄 Hermes 三栅栏：**每次=全新隔离 session / cron 内禁建 cron / 支持限时**；`context_from` 串流水线 | M |
| L2.5 **自然语言建任务** | 群里说"每天早 9 点…"→ agent 经 MCP 工具自建 cron | 复用 L2 调度器 | S(+L2后) |
| L3 **Home Chat 运维群** | 指定一个群收：服务重启/报错/cron 结果/**用量预警(5h>85%)** | 让 agent "有家"；用量监控已有，预警白拿 | S |
| L3.5 **飞书卡片权限审批** | fork 要执行敏感工具时发卡片[允许/拒绝/总是允许] | stream-json permission 事件驱动；**官方 Channels 都没做到** | M |
| L4 **Heartbeat** | 周期性主会话 turn 读 HEARTBEAT.md 清单，没事静默(HEARTBEAT_OK)，有事推群 | OpenClaw 第一卖点；可作 cron 特例实现 | S(+L2后) |
| L5 多会话流水线 | A 节点产出路由给 B 深加工 | 画布连线语义扩展 | L |

## 5. 安全（独有卖点，反向学习对手事故）

- skill poisoning 教训 → **只有 base(主人)可写 skill/soul 的进化，访客 fork 对配置只读**
- pairing code 访客准入：默认拒绝陌生人 → 一次性配对码(1h 限速) → 主人批准
- 审计 UI + 脱敏链路可视化 + 群级工具白名单 → 营销直接对标 lethal trifecta 讨论

## 6. 被开发者喜爱的非功能项

1. **config as code**：画布⇄声明式文本双向（可 git/diff/分享晒图）
2. **5 分钟 onboarding**：让 claude 自己驱动配置向导（学 op7418；"AI 给自己装桥"本身即 demo）
3. **README kill demo GIF**：群里 @机器人修 CI → 它读仓库给修复 → 人设语气回答 → 30 秒
4. 文档叙事：先讲"你的订阅在飞书群 7×24 值班，零额外成本"，再讲安全

## 7. 落地顺序（修订定稿）

1. ✅ **SOUL.md 人格 v1**（本夜实现）：文件+播种+slot#1 注入+GUI 编辑入口 — S
2. **知识收件箱**（提取→审批→写 CLAUDE.md）— 用户点名 + 独有闭环 — M
3. **Cron 节点 + Home Chat**（含用量预警）— Agentic 入门 — M
4. **GROUP.md 记忆 + memory 工具 + proactive flush** — M
5. **飞书卡片权限审批** — 越级体验 — M
6. Heartbeat + 自然语言建任务 — S（依赖3）
7. FTS5 transcript 检索 MCP 工具 — M
8. onboarding 向导 + config as code + README 重写 — M
9. pairing code 准入 + 安全可视化 — S-M
