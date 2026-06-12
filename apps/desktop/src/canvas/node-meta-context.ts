import { createContext } from "react";

/** 各会话节点的 transcript 最终修改时间(ms)：节点卡用它显示"最终修改日期"，比 md5 sid 直观 */
export const NodeMetaContext = createContext<{
  metas: Record<string, { base?: number; fork?: number }>;
}>({ metas: {} });
