import { useEffect, useState } from "react";
import type { OblivionisConfig, FeishuStatus, Owner } from "@oblivionis/shared";
import type { BridgeClient } from "../bridge-client.js";
import { useT } from "../i18n/index.js";

export interface FeishuState {
  status: FeishuStatus;
  detail?: string;
  bot?: { openId?: string; name?: string; appId?: string };
}

const STATUS_TEXT: Record<FeishuStatus, string> = {
  disconnected: "未连接",
  connecting: "连接中…",
  connected: "已连接",
  error: "连接出错",
  mock: "Mock(本地调试)",
};

export function FeishuStatusDot({ status }: { status: FeishuStatus }) {
  const t = useT();
  return <span className={`fs-dot fs-${status}`} title={t(STATUS_TEXT[status])} />;
}

interface Props {
  client: BridgeClient;
  config: OblivionisConfig | null;
  state: FeishuState;
  /** 主人列表（这些人 @机器人 可改代码） */
  owners: Owner[];
  onSetOwners: (owners: Owner[]) => void;
  /** open_id 查询结果 */
  lookupResult: { items: Array<{ label: string; openId: string }>; error?: string } | null;
  onLookup: (mobile?: string, email?: string) => void;
  /** 设置 Home Chat（运维群：定时任务结果/服务通知的默认投递地） */
  onSetHomeChat: (chatId: string) => void;
}

/**
 * 飞书机器人连接配置（每个安装实例独立）。
 * 录入 App ID / App Secret / 域，保存即(重)连接；显示连接状态与机器人身份。
 */
export function FeishuPanel({
  client,
  config,
  state,
  owners,
  onSetOwners,
  lookupResult,
  onLookup,
  onSetHomeChat,
}: Props) {
  const t = useT();
  const [homeChat, setHomeChat] = useState("");
  useEffect(() => {
    setHomeChat(config?.homeChatId ?? "");
  }, [config?.homeChatId]);
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const [domain, setDomain] = useState<"feishu" | "lark">("feishu");
  const [manualId, setManualId] = useState("");
  const [manualName, setManualName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (config) {
      setAppId(config.feishu.appId);
      setDomain(config.feishu.domain);
    }
  }, [config?.feishu.appId, config?.feishu.domain]);

  const hasSavedSecret = !!config?.feishu.appSecret;

  const saveConnect = () => {
    const useSecret = secret || config?.feishu.appSecret || "";
    client.send({ type: "feishu-set", appId: appId.trim(), appSecret: useSecret, domain });
  };

  return (
    <div className="feishu-panel">
      <div className="fs-statusline">
        <FeishuStatusDot status={state.status} />
        <strong>{t(STATUS_TEXT[state.status])}</strong>
        {state.bot?.name ? <span className="muted">{t("· 机器人：{0}", state.bot.name)}</span> : null}
      </div>
      {state.detail ? <div className="fs-detail">{state.detail}</div> : null}
      {state.bot?.openId ? <div className="fs-detail">open_id: {state.bot.openId}</div> : null}

      <label className="field">
        <span>App ID</span>
        <input value={appId} placeholder="cli_xxx" onChange={(e) => setAppId(e.target.value)} />
      </label>
      <label className="field">
        <span>App Secret</span>
        <input
          type="password"
          value={secret}
          placeholder={hasSavedSecret ? t("已保存（留空则沿用）") : t("应用 Secret")}
          onChange={(e) => setSecret(e.target.value)}
        />
      </label>
      <label className="field">
        <span>{t("域")}</span>
        <select value={domain} onChange={(e) => setDomain(e.target.value as "feishu" | "lark")}>
          <option value="feishu">{t("feishu（飞书/国内）")}</option>
          <option value="lark">{t("lark（海外）")}</option>
        </select>
      </label>

      <div className="fs-actions">
        <button className="primary" onClick={saveConnect}>
          {t("保存并连接")}
        </button>
        <button onClick={() => client.send({ type: "feishu-connect" })}>{t("重连")}</button>
        <button onClick={() => client.send({ type: "feishu-disconnect" })}>{t("断开")}</button>
      </div>

      <div className="owners-box">
        <div className="base-session-title">{t("主人（@机器人时可改代码；其余人只读咨询）")}</div>
        {owners.length === 0 ? (
          <div className="fs-detail">{t("尚未设置主人——目前所有人 @ 都只读咨询（fail-closed）。")}</div>
        ) : (
          owners.map((o, i) => (
            <div key={o.openId} className="owner-row">
              <input
                className="owner-name-input"
                defaultValue={o.name ?? ""}
                placeholder={t("姓名(可填)")}
                onBlur={(e) => {
                  const v = e.target.value.trim() || undefined;
                  if (v !== o.name) {
                    const next = owners.slice();
                    next[i] = { ...o, name: v };
                    onSetOwners(next);
                  }
                }}
              />
              <span className="owner-id" title={o.openId}>
                {o.openId}
              </span>
              <button
                className="ghost"
                onClick={() => onSetOwners(owners.filter((x) => x.openId !== o.openId))}
              >
                {t("移除")}
              </button>
            </div>
          ))
        )}
        <div className="fs-actions">
          <input
            value={manualId}
            placeholder="open_id (ou_...)"
            onChange={(e) => setManualId(e.target.value)}
          />
          <input
            value={manualName}
            placeholder="姓名(可填)"
            onChange={(e) => setManualName(e.target.value)}
          />
          <button
            onClick={() => {
              const id = manualId.trim();
              if (id && !owners.some((o) => o.openId === id)) {
                onSetOwners([...owners, { openId: id, name: manualName.trim() || undefined }]);
              }
              setManualId("");
              setManualName("");
            }}
          >
            {t("添加")}
          </button>
        </div>

        <div className="fs-actions">
          <input value={mobile} placeholder={t("手机号")} onChange={(e) => setMobile(e.target.value)} />
          <input value={email} placeholder={t("或邮箱")} onChange={(e) => setEmail(e.target.value)} />
          <button onClick={() => onLookup(mobile || undefined, email || undefined)}>{t("查 open_id")}</button>
        </div>
        {lookupResult?.error && (
          <div className="fs-detail err">{t("查询失败：{0}（需通讯录权限 contact:user.id:readonly）", lookupResult.error)}</div>
        )}
        {lookupResult?.items?.map((r) => (
          <div key={r.openId} className="owner-row">
            <span className="owner-id" title={r.openId}>
              {r.label} → {r.openId}
            </span>
            <button
              className="primary"
              disabled={owners.some((o) => o.openId === r.openId)}
              onClick={() => onSetOwners([...owners, { openId: r.openId, name: r.label }])}
            >
              {t("设为主人")}
            </button>
          </div>
        ))}

        <div className="fs-detail">
          {t("主人只能在本机刻意设置（飞书里的人无法自助成为主人）。手机号/邮箱查询用于直接查到你自己的 open_id；日志里也会显示发送者 open_id 作参考。")}
        </div>
      </div>

      <div className="owners-box">
        <div className="base-session-title">{t("Home Chat（运维群：定时任务结果/服务通知默认发这里）")}</div>
        <div className="fs-actions">
          <input
            value={homeChat}
            placeholder={t("chatId (oc_...)，可从画布上的群节点复制")}
            onChange={(e) => setHomeChat(e.target.value)}
          />
          <button onClick={() => onSetHomeChat(homeChat.trim())}>{t("保存")}</button>
        </div>
      </div>

      <div className="fs-help">
        {t("飞书后台需开通以下权限：im:message、im:message:send_as_bot、im:chat、im:resource；事件订阅选「长连接」并订阅 im.message.receive_v1。")}
      </div>
    </div>
  );
}
