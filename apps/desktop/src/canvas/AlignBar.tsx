export type AlignKind = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

interface Props {
  count: number;
  onAlign: (kind: AlignKind) => void;
  onDistribute: (axis: "h" | "v") => void;
}

// 4 个基础图标（start/center/end/distribute），纵向变体靠 rotate(90deg) 复用
const I = { w: 15, h: 15, sw: 1.3, fill: "currentColor" };
function AlignStartIcon() {
  return (
    <svg viewBox="0 0 16 16" width={I.w} height={I.h} fill="none" stroke="currentColor" strokeWidth={I.sw}>
      <line x1={2} y1={2} x2={2} y2={14} />
      <rect x={3.5} y={3.5} width={9} height={3} rx={1} fill={I.fill} stroke="none" />
      <rect x={3.5} y={9.5} width={6} height={3} rx={1} fill={I.fill} stroke="none" />
    </svg>
  );
}
function AlignCenterIcon() {
  return (
    <svg viewBox="0 0 16 16" width={I.w} height={I.h} fill="none" stroke="currentColor" strokeWidth={I.sw}>
      <line x1={8} y1={2} x2={8} y2={14} />
      <rect x={2.5} y={3.5} width={11} height={3} rx={1} fill={I.fill} stroke="none" />
      <rect x={4.5} y={9.5} width={7} height={3} rx={1} fill={I.fill} stroke="none" />
    </svg>
  );
}
function AlignEndIcon() {
  return (
    <svg viewBox="0 0 16 16" width={I.w} height={I.h} fill="none" stroke="currentColor" strokeWidth={I.sw}>
      <line x1={14} y1={2} x2={14} y2={14} />
      <rect x={3.5} y={3.5} width={9} height={3} rx={1} fill={I.fill} stroke="none" />
      <rect x={6.5} y={9.5} width={6} height={3} rx={1} fill={I.fill} stroke="none" />
    </svg>
  );
}
function DistributeIcon() {
  return (
    <svg viewBox="0 0 16 16" width={I.w} height={I.h} fill={I.fill}>
      <rect x={2} y={3} width={2.4} height={10} rx={1} />
      <rect x={6.8} y={3} width={2.4} height={10} rx={1} />
      <rect x={11.6} y={3} width={2.4} height={10} rx={1} />
    </svg>
  );
}
const rot: React.CSSProperties = { transform: "rotate(90deg)" };

/** 多选(≥2)时浮出的对齐/分布工具条（专业编辑器标配）。分布需 ≥3 个节点。 */
export function AlignBar({ count, onAlign, onDistribute }: Props) {
  const canDist = count >= 3;
  return (
    <div className="canvas-align-bar">
      <span className="cab-count">{count} 个节点</span>
      <span className="cab-sep" />
      <button className="cab-btn" title="左对齐" onClick={() => onAlign("left")}>
        <AlignStartIcon />
      </button>
      <button className="cab-btn" title="水平居中" onClick={() => onAlign("hcenter")}>
        <AlignCenterIcon />
      </button>
      <button className="cab-btn" title="右对齐" onClick={() => onAlign("right")}>
        <AlignEndIcon />
      </button>
      <span className="cab-sep" />
      <button className="cab-btn" title="顶对齐" onClick={() => onAlign("top")}>
        <span style={rot}>
          <AlignStartIcon />
        </span>
      </button>
      <button className="cab-btn" title="垂直居中" onClick={() => onAlign("vcenter")}>
        <span style={rot}>
          <AlignCenterIcon />
        </span>
      </button>
      <button className="cab-btn" title="底对齐" onClick={() => onAlign("bottom")}>
        <span style={rot}>
          <AlignEndIcon />
        </span>
      </button>
      <span className="cab-sep" />
      <button className="cab-btn" title="水平等距分布（需≥3）" disabled={!canDist} onClick={() => onDistribute("h")}>
        <DistributeIcon />
      </button>
      <button className="cab-btn" title="垂直等距分布（需≥3）" disabled={!canDist} onClick={() => onDistribute("v")}>
        <span style={rot}>
          <DistributeIcon />
        </span>
      </button>
    </div>
  );
}
