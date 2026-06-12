import { createContext } from "react";

/** 让自定义连线(ConditionEdge)上的控件回调到 App：编辑条件浮窗 / 一键删除连线 */
export const EdgeActionContext = createContext<{
  editEdge: (id: string) => void;
  deleteEdge: (id: string) => void;
}>({
  editEdge: () => {},
  deleteEdge: () => {},
});
