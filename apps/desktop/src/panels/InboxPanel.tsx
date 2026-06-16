import { useState } from "react";
import type { KnowledgeItem } from "@oblivionis/shared";
import { useT } from "../i18n/index.js";

interface Props {
  items: KnowledgeItem[];
  onDecide: (id: string, action: "accept" | "dismiss", editedRule?: string) => void;
}

/**
 * 知识收件箱：群聊问答中提取出的"规则性指令"候选，由主人裁决。
 * 采纳 → 写入该会话 cwd 的 CLAUDE.md（主会话与未来的访客分身自动继承，可进 git 团队共享）。
 */
export function InboxPanel({ items, onDecide }: Props) {
  const t = useT();
  const pending = items.filter((x) => x.status === "pending").sort((a, b) => b.ts - a.ts);
  const done = items.filter((x) => x.status !== "pending").sort((a, b) => b.ts - a.ts).slice(0, 30);

  if (items.length === 0)
    return (
      <div className="panel-empty">
        {t("暂无待裁决的知识。")}
        <br />
        {t("群聊问答中出现“规则性指令”（如“以后打包前先跑 lint”）时，会自动提取到这里等你裁决；采纳后写入项目的 CLAUDE.md，主会话与访客分身都会遵守。")}
      </div>
    );

  return (
    <div className="inbox">
      {pending.length > 0 && <div className="inbox-section">{t("待裁决 · {0}", pending.length)}</div>}
      {pending.map((it) => (
        <PendingCard key={it.id} item={it} onDecide={onDecide} />
      ))}
      {done.length > 0 && <div className="inbox-section dim">{t("已处理")}</div>}
      {done.map((it) => (
        <div key={it.id} className={`inbox-done ${it.status}`}>
          <span className="inbox-done-mark">{it.status === "accepted" ? "✅" : "✖"}</span>
          <span className="inbox-done-rule">{it.rule}</span>
          <span className="inbox-done-meta">{it.nodeLabel}</span>
        </div>
      ))}
    </div>
  );
}

function PendingCard({
  item,
  onDecide,
}: {
  item: KnowledgeItem;
  onDecide: Props["onDecide"];
}) {
  const t = useT();
  const [text, setText] = useState(item.rule);
  const isSoul = item.kind === "soul";
  return (
    <div className={`inbox-card ${isSoul ? "soul" : ""}`}>
      {isSoul && <div className="inbox-kind">{t("🎭 人格演化提案 · {0}", item.nodeLabel)}</div>}
      <textarea
        className="inbox-rule"
        value={text}
        rows={isSoul ? 10 : 2}
        onChange={(e) => setText(e.target.value)}
        title={isSoul ? t("修订后的完整 SOUL.md，可直接编辑后采纳") : t("可直接编辑后再采纳")}
      />
      <div className="inbox-meta">
        <span>{item.nodeLabel}</span>
        <span>·</span>
        <span>{item.sender}</span>
        <span>·</span>
        <span>{new Date(item.ts).toLocaleString()}</span>
      </div>
      <div className="inbox-src" title={item.source}>
        {isSoul ? item.source : t("源于提问：{0}", item.source)}
      </div>
      <div className="inbox-actions">
        <button
          className="inbox-accept"
          title={
            isSoul
              ? t("覆写该会话的 SOUL.md（下条消息生效）")
              : t("写入 {0}\\CLAUDE.md 的「群聊沉淀规则」小节", item.cwd)
          }
          onClick={() => onDecide(item.id, "accept", text)}
        >
          {isSoul ? t("✅ 采纳 → 更新人格") : t("✅ 采纳 → CLAUDE.md")}
        </button>
        <button className="inbox-dismiss" onClick={() => onDecide(item.id, "dismiss")}>
          {t("抛弃")}
        </button>
      </div>
    </div>
  );
}
