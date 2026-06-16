import { useT } from "../i18n/index.js";

export interface AuditItem {
  chatId: string;
  senderId: string;
  sender: string;
  text: string;
  ts: number;
}

interface Props {
  items: AuditItem[];
  owners: { openId: string }[];
  /** chatId -> 群显示名 */
  groupName: (chatId: string) => string;
}

/**
 * 审计：按"群 + 时间"展示每条 @机器人 的提问（标主人/访客）。
 * durable 记录由引擎落盘在 ~/.oblivionis/audit.jsonl。
 */
export function AuditPanel({ items, owners, groupName }: Props) {
  const t = useT();
  if (items.length === 0)
    return (
      <div className="panel-empty">
        {t("暂无 @消息记录。")}
        <br />
        {t("持久记录在 ")}<code>~/.oblivionis/audit.jsonl</code>
      </div>
    );

  const ownerSet = new Set(owners.map((o) => o.openId));
  const groups = new Map<string, AuditItem[]>();
  for (const it of items) {
    const arr = groups.get(it.chatId) ?? [];
    arr.push(it);
    groups.set(it.chatId, arr);
  }

  return (
    <div className="audit">
      {[...groups.entries()].map(([chatId, arr]) => (
        <div key={chatId} className="audit-group">
          <div className="audit-group-head">
            {groupName(chatId)} <span className="muted">{chatId}</span>
          </div>
          {arr
            .slice()
            .sort((a, b) => b.ts - a.ts)
            .map((it, i) => (
              <div key={i} className="audit-row">
                <span className="audit-ts">{new Date(it.ts).toLocaleString()}</span>
                <span className={ownerSet.has(it.senderId) ? "badge-owner" : "badge-guest"}>
                  {ownerSet.has(it.senderId) ? t("主人") : t("访客")}
                </span>
                <span className="audit-sender" title={it.senderId}>
                  {it.sender}
                </span>
                <span className="audit-text">{it.text}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
