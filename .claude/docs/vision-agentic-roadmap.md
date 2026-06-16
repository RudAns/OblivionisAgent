# OblivionisAgent 演进路线：从 IDE 壳子到被开发者喜爱的养成系 Agent

> 设计定稿。选型依据见 [research-hermes-oauth.md](research-hermes-oauth.md)（为何遥控官方 CLI 而非直连 API）。
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
- 审计 UI + 脱敏链路可视化 + 群级工具白名单 → 营销直接对标 lethal trifecta 讨论
- ~~pairing code 访客准入~~ → **砍掉**（决策见 §8）；真有大群需求改做轻量「访客限流」

## 6. 被开发者喜爱的非功能项

1. **config as code**：画布⇄声明式文本双向（可 git/diff/分享晒图）
2. **5 分钟 onboarding**：让 claude 自己驱动配置向导（学 op7418；"AI 给自己装桥"本身即 demo）
3. **README kill demo GIF**：群里 @机器人修 CI → 它读仓库给修复 → 人设语气回答 → 30 秒
4. 文档叙事：先讲"你的订阅在飞书群 7×24 值班，零额外成本"，再讲安全

## 7. 进度（2026-06-11 截至深夜）

**✅ 已完成**
1. SOUL.md 人格 v1（文件+播种+slot#1 注入+GUI 编辑）
2. 知识收件箱（提取→裁决→写 CLAUDE.md）
3. Cron 节点 + Home Chat
4. 用量预警（5h≥85% 发 Home Chat，穿越式触发）
5. 人格自主迭代闭环（每日反思→收件箱 kind=soul→采纳覆写 SOUL.md）
6. 飞书卡片权限审批（MCP 双模式自举，官方 Channels 没有的能力）⭐

**✅ 第二批（2026-06-11 续）**
7. GROUP.md 群记忆（反思式提炼，非 MCP，避免每条消息 spawn 重 exe；GUI 飞书群节点「🧠 群记忆」）
8. 自然语言建 cron（仅主人+定时关键词粗筛→haiku 解析→建 cron 节点+连线+回执）
9. Webhook 入口节点（node:http /hook/<token>，0.0.0.0 绑定供局域网 CI 回调；结果脱敏发群）
10. 转录关键词搜索（GUI 过滤+高亮；近 3 天）
11. 安全态势摘要（会话 inspector 显示脱敏 fork/出站脱敏/审批/权限分级）

**⬜ 仍待做**
- **onboarding 向导 + config as code + README 重写**（M）— 开源传播向
- **App Secret 加密 + 安装包代码签名**（公司分发前必做）
- ~~Transcript FTS5 检索（agent 侧 MCP 工具）~~ → **降级**：FTS5 需 better-sqlite3 原生模块，
  pkg 单 exe 打不进去（同 node-pty 的坑）；且 GROUP.md 已覆盖"agent 记得这个群"的需求。
  已做 GUI 端关键词搜索（#10）满足"人去翻历史"。agent 侧精确检索留作未来（可走 ripgrep 子进程而非 sqlite）

## 8. 砍掉的项（决策留痕，避免以后重提）

- **Heartbeat ❌**（2026-06-11 决策）：本质=特殊 cron，能力已被 Cron 节点覆盖；且"每30分钟主动
  在群里说话"对飞书群=打扰而非惊喜。我们的"主动性"正确形态是**事件驱动**（Webhook/CI），不是空想心跳。
  保留其唯一有价值的衍生品「自然语言建 cron」。
- **pairing code 配对码 ❌**（2026-06-11 决策）：它为"任何人都能 DM"场景设计；我们已有
  owner/guest + fail-closed + 脱敏，且飞书群自带入群门槛——增量价值小、对群体验偏重。
  真实诉求（防群友白嫖订阅额度）用轻量「访客限流」替代即可。
