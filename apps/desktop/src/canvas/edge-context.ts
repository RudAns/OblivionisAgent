import { createContext } from "react";

/** 让自定义连线(ConditionEdge)上的徽标能回调到 App 去打开"连线条件"编辑浮窗 */
export const EdgeActionContext = createContext<{ editEdge: (id: string) => void }>({
  editEdge: () => {},
});
