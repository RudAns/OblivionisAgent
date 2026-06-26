import { useEffect, useMemo, useRef, useState } from "react";
import type { ClaudeStreamEvent } from "@oblivionis/shared";
import { assistantText, isAssistant, isInit, isResult } from "@oblivionis/shared";
import { useT } from "../i18n/index.js";

interface Props {
  nodeId: string | null;
  events: ClaudeStreamEvent[];
}

/** 循环节点每轮指令的合成事件（非 claude 原生，由 bridge 镜像注入，见 loop-runner mirrorInput） */
function isLoopInput(e: ClaudeStreamEvent): e is { type: "loop-input"; round: number; text: string } {
  return e.type === "loop-input";
}

/** 取一条事件里可供搜索/显示的文本 */
function eventText(e: ClaudeStreamEvent): string {
  if (isAssistant(e)) return assistantText(e) ?? "";
  if (isLoopInput(e)) return e.text ?? "";
  if (isInit(e)) return `init ${e.model} ${e.cwd}`;
  if (isResult(e)) return `done ${e.subtype}`;
  return "";
}

/** 把整段转录拼成可读纯文本（块化、带语义标签），用于「复制全部」 */
function transcriptToText(events: ClaudeStreamEvent[]): string {
  return events
    .map((e) => {
      if (isLoopInput(e)) return `🔁 第${e.round}轮指令:\n${e.text}`;
      if (isAssistant(e)) return assistantText(e) || "";
      if (isResult(e)) return `✅ 完成 · ${e.subtype}`;
      if (isInit(e)) return `⚙️ 初始化 · model=${e.model}`;
      if (e.type === "user") return "↪️ 工具结果";
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

/** 语义复制按钮：悬停浮现，复制该块原文（命令 / 回复 / 整段都复用它）。失败静默。 */
function CopyBtn({ text, title }: { text: string; title?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      className="evt-copy"
      title={title ?? t("复制这块")}
      onClick={(ev) => {
        ev.stopPropagation();
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1200);
          })
          .catch(() => {});
      }}
    >
      {done ? "✓" : "⧉"}
    </button>
  );
}

/** 解析 stream-json，把一个会话节点的运行过程渲染成可读转录（支持关键词过滤） */
export function TranscriptPanel({ nodeId, events }: Props) {
  const t = useT();
  const endRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => eventText(e).toLowerCase().includes(q));
  }, [events, filter]);

  // 新事件自动滚到底（仅未过滤时；过滤态不抢滚动）
  useEffect(() => {
    if (!filter) endRef.current?.scrollIntoView({ block: "end" });
  }, [nodeId, events.length, filter]);

  if (!nodeId) return <div className="panel-empty">{t("从左侧会话列表选择一个会话，查看访客提问的处理过程")}</div>;
  if (events.length === 0)
    return <div className="panel-empty">{t("该会话暂无访客活动。群里 @机器人 提问、或在节点编辑里发测试消息后，这里会实时显示处理过程（记录保留约 3 天）。")}</div>;

  return (
    <div className="transcript-wrap">
      <div className="transcript-search">
        <input
          value={filter}
          placeholder={t("🔎 搜索这个会话的历史…（保留约 3 天）")}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filter && (
          <span className="ts-count">
            {filtered.length}/{events.length}
          </span>
        )}
        <CopyBtn text={transcriptToText(filtered)} title={t("复制全部（当前显示）")} />
      </div>
      <div className="transcript">
        {filter && filtered.length === 0 && <div className="panel-empty">{t("没有匹配的内容")}</div>}
        {filtered.map((e, i) => (
          <EventRow key={i} e={e} highlight={filter} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

/** 关键词高亮 */
function mark(text: string, q: string) {
  if (!q) return text;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const out: Array<string | JSX.Element> = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const idx = lower.indexOf(ql, i);
    if (idx < 0) {
      out.push(text.slice(i));
      break;
    }
    if (idx > i) out.push(text.slice(i, idx));
    out.push(<mark key={k++}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
  }
  return out;
}

function EventRow({ e, highlight }: { e: ClaudeStreamEvent; highlight: string }) {
  const t = useT();
  if (isInit(e)) {
    return (
      <div className="evt evt-init">
        ⚙️ {t("初始化")} · model={e.model} · auth={e.apiKeySource} · cwd={e.cwd}
      </div>
    );
  }
  if (isAssistant(e)) {
    const text = assistantText(e);
    const tools = e.message.content.filter((b) => b.type === "tool_use");
    return (
      <div className="evt evt-assistant">
        {text ? <CopyBtn text={text} /> : null}
        {text ? <div className="evt-text">{highlight ? mark(text, highlight) : text}</div> : null}
        {tools.map((t, i) => (
          <div key={i} className="evt-tool">🔧 {String(t.name)}</div>
        ))}
      </div>
    );
  }
  if (isLoopInput(e)) {
    return (
      <div className="evt evt-loop-input">
        <CopyBtn text={e.text} />
        🔁 {t("第 {0} 轮指令", e.round)}
        <div className="evt-text">{highlight ? mark(e.text, highlight) : e.text}</div>
      </div>
    );
  }
  if (e.type === "user") {
    return <div className="evt evt-tool-result">{t("↪️ 工具结果")}</div>;
  }
  if (isResult(e)) {
    return (
      <div className={`evt evt-result ${e.is_error ? "err" : ""}`}>
        ✅ {t("完成")} · {e.subtype} · ${e.total_cost_usd?.toFixed(4)} · {t("{0} 轮", e.num_turns ?? 0)}
      </div>
    );
  }
  return null;
}
