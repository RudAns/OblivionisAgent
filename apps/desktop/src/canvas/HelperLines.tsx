import { useEffect, useRef, type CSSProperties } from "react";
import { useStore } from "@xyflow/react";

const canvasStyle: CSSProperties = {
  position: "absolute",
  width: "100%",
  height: "100%",
  top: 0,
  left: 0,
  pointerEvents: "none",
  zIndex: 10,
};

interface Props {
  horizontal?: number;
  vertical?: number;
}

/**
 * 拖动节点时的对齐参考线：一块铺满画布的透明 canvas，按当前视口 transform
 * 把「画布坐标」的对齐线换算成屏幕像素画出来。逐项 select 基本类型避免对象比较抖动。
 */
export function HelperLines({ horizontal, vertical }: Props) {
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const tx = useStore((s) => s.transform[0]);
  const ty = useStore((s) => s.transform[1]);
  const scale = useStore((s) => s.transform[2]);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpi = window.devicePixelRatio || 1;
    canvas.width = width * dpi;
    canvas.height = height * dpi;
    ctx.scale(dpi, dpi);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#4f8cff";
    ctx.lineWidth = 1;

    if (typeof vertical === "number") {
      const x = vertical * scale + tx;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    if (typeof horizontal === "number") {
      const y = horizontal * scale + ty;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }, [width, height, tx, ty, scale, horizontal, vertical]);

  return <canvas ref={ref} className="helper-lines-canvas" style={canvasStyle} />;
}
