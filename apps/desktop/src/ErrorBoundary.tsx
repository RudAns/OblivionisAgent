import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
  info: string;
}

/** 错误边界：渲染崩溃时不再白屏，而是显示报错 + 重载按钮，便于排查。 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? "" });
    console.error("[OblivionisAgent] 渲染错误:", error, info);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          padding: 24,
          height: "100vh",
          overflow: "auto",
          background: "#14161a",
          color: "#e6e6e6",
          fontFamily: "Consolas, 'Cascadia Mono', monospace",
          fontSize: 13,
        }}
      >
        <h2 style={{ color: "#ff5d5d", margin: "0 0 8px" }}>界面出错了（已被拦住，未白屏）</h2>
        <p style={{ color: "#8a93a0" }}>把下面这段报错截图/复制发给开发者即可精准修复：</p>
        <pre style={{ whiteSpace: "pre-wrap", color: "#ffb84d", marginTop: 8 }}>
          {String(error.message)}
        </pre>
        <pre style={{ whiteSpace: "pre-wrap", color: "#8a93a0", fontSize: 11 }}>{error.stack}</pre>
        <pre style={{ whiteSpace: "pre-wrap", color: "#5a6472", fontSize: 11 }}>{info}</pre>
        <button
          onClick={() => location.reload()}
          style={{
            marginTop: 14,
            padding: "6px 16px",
            background: "#4f8cff",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          重载界面
        </button>
      </div>
    );
  }
}
