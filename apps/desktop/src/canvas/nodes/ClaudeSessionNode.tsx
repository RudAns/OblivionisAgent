import { useContext } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { NodeShell, Row, tailTruncate } from "./NodeShell.js";
import { NodeMetaContext } from "../node-meta-context.js";
import { useI18n, type Lang } from "../../i18n/index.js";

/** ms → 简洁日期：今年省略年份；en 用本地化短月（Jun 16），zh 用「M月D日」 */
function fmtDate(ms: number | undefined, lang: Lang): string | undefined {
  if (!ms) return undefined;
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  if (lang === "en") {
    const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return sameYear ? md : `${md}, ${d.getFullYear()}`;
  }
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return sameYear ? md : `${d.getFullYear()}年${md}`;
}

export function ClaudeSessionNode({ id, data, selected }: NodeProps) {
  const { t, lang } = useI18n();
  const d = data as {
    label: string;
    cwd: string;
    model?: string;
    permissionMode: string;
    guestPermissionMode?: string;
    sessionId?: string;
    baseSessionId?: string;
    status?: string;
  };
  const { metas } = useContext(NodeMetaContext);
  const meta = metas[id];
  const baseDate = fmtDate(meta?.base, lang);
  const forkDate = fmtDate(meta?.fork, lang);
  const isFork = !!d.baseSessionId; // 有 base = 双会话模型：base=终端、fork=飞书分身
  return (
    <NodeShell
      kind="claude"
      icon="🤖"
      label={d.label || t("Claude 会话")}
      selected={selected}
      status={d.status ?? "idle"}
      hasSource={false}
    >
      {/* 人格连接口：Soul 节点拖到这里，作用于该会话的飞书回复(fork 脱敏分身)。
          终端(base)注入人格已评估为不需要，故只留单个口 */}
      <Handle type="target" id="fork" position={Position.Top} className="soul-port" style={{ left: "50%" }} />
      <span className="soul-port-label" style={{ left: "50%" }}>{t("🎭人格/🧩技能/🦾子代理")}</span>

      <Row k="cwd" v={tailTruncate(d.cwd) || t("(未设置)")} dim={!d.cwd} title={d.cwd || undefined} />
      <Row k={t("模型")} v={d.model || t("默认")} />
      <Row k={t("权限")} v={`${d.permissionMode} / ${d.guestPermissionMode ?? "default"}`} />
      {/* 原始(终端)会话：显示最终修改日期，而非人类不可读的 md5 sid */}
      <Row
        k={t("🖥️原始")}
        v={isFork ? (baseDate ? t("终端 · 改于 {0}", baseDate) : t("终端会话")) : t("首次运行生成")}
        dim={!isFork}
      />
      {/* Fork 脱敏分身：飞书走这条（只读快照，刷新在右侧面板） */}
      <div className="session-fork-strip">
        <span className="sfs-tag">{t("脱敏分身")}</span>
        <span className="sfs-sid">
          {d.sessionId
            ? forkDate
              ? t("改于 {0}", forkDate)
              : t("已生成")
            : isFork
              ? t("首次访客消息时生成")
              : t("首次运行生成")}
        </span>
        <span className="sfs-note">{t("飞书走这条")}</span>
      </div>
    </NodeShell>
  );
}
