import { useEffect, useRef } from "react";
import type { ClaudeStreamEvent } from "@oblivionis/shared";
import { assistantText, isAssistant, isInit, isResult } from "@oblivionis/shared";

interface Props {
  nodeId: string | null;
  events: ClaudeStreamEvent[];
}

/** 解析 stream-json，把一个会话节点的运行过程渲染成可读转录 */
export function TranscriptPanel({ nodeId, events }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  // 新事件自动滚到底（最新内容永远可见）
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [nodeId, events.length]);

  if (!nodeId) return <div className="panel-empty">从左侧会话列表选择一个会话，查看访客提问的处理过程</div>;
  if (events.length === 0)
    return <div className="panel-empty">该会话暂无访客活动。群里 @机器人 提问、或在节点编辑里发测试消息后，这里会实时显示处理过程（记录保留约 3 天）。</div>;

  return (
    <div className="transcript">
      {events.map((e, i) => (
        <EventRow key={i} e={e} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

function EventRow({ e }: { e: ClaudeStreamEvent }) {
  if (isInit(e)) {
    return (
      <div className="evt evt-init">
        ⚙️ 初始化 · model={e.model} · auth={e.apiKeySource} · cwd={e.cwd}
      </div>
    );
  }
  if (isAssistant(e)) {
    const text = assistantText(e);
    const tools = e.message.content.filter((b) => b.type === "tool_use");
    return (
      <div className="evt evt-assistant">
        {text ? <div className="evt-text">{text}</div> : null}
        {tools.map((t, i) => (
          <div key={i} className="evt-tool">🔧 {String(t.name)}</div>
        ))}
      </div>
    );
  }
  if (e.type === "user") {
    return <div className="evt evt-tool-result">↪️ 工具结果</div>;
  }
  if (isResult(e)) {
    return (
      <div className={`evt evt-result ${e.is_error ? "err" : ""}`}>
        ✅ 完成 · {e.subtype} · ${e.total_cost_usd?.toFixed(4)} · {e.num_turns} 轮
      </div>
    );
  }
  return null;
}
