interface Props {
  bridgeUp: boolean;
  sessionCount: number;
  openTerminals: number;
  activeLabel: string | null;
  /** 刚自动保存过 → 短暂显示"已保存 ✓" */
  saved?: boolean;
}

/** 底部状态栏（参考专业 IDE）：后台服务状态、会话统计、当前终端、自动保存提示 */
export function StatusBar({ bridgeUp, sessionCount, openTerminals, activeLabel, saved }: Props) {
  return (
    <footer className="statusbar">
      <span
        className={`sb-item sb-bridge ${bridgeUp ? "up" : "down"}`}
        title="本软件的后台服务（随应用自动启动，负责飞书收发与会话调度）"
      >
        <span className="sb-dot" />
        {bridgeUp ? "服务就绪" : "正在启动后台服务…"}
      </span>
      <span className="sb-flex" />
      {activeLabel && (
        <span className="sb-item" title="当前终端">
          ⌨ {activeLabel}
        </span>
      )}
      <span className="sb-item" title="画布上的 Claude 会话节点数 / 已打开的终端数">
        会话 {sessionCount} · 终端 {openTerminals}
      </span>
      <span className={`sb-item dim ${saved ? "sb-saved" : ""}`}>{saved ? "已保存 ✓" : "改动自动保存"}</span>
      <span className="sb-item dim">v0.1.0</span>
    </footer>
  );
}
