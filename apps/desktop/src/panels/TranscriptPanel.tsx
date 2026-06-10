import type { ClaudeStreamEvent } from "@oblivionis/shared";
import { assistantText, isAssistant, isInit, isResult } from "@oblivionis/shared";

interface Props {
  nodeId: string | null;
  events: ClaudeStreamEvent[];
}

/** 解析 stream-json，把一个会话节点的运行过程渲染成可读转录 */
export function TranscriptPanel({ nodeId, events }: Props) {
  if (!nodeId) return <div className="panel-empty">点画布上的「Claude 会话」节点查看转录</div>;
  if (events.length === 0)
    return <div className="panel-empty">暂无事件。给该会话发条消息试试（飞书或下方测试框）。</div>;

  return (
    <div className="transcript">
      {events.map((e, i) => (
        <EventRow key={i} e={e} />
      ))}
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
