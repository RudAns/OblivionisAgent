import { createContext } from "react";

/**
 * 节点卡片 hover 时露出的快捷操作（复制 / 删除），由 NodeShell 统一渲染、
 * 经此 context 回调到 App 的剪贴板/删除逻辑——省得每次都右键开菜单。
 * 复用 App 里既有的「复制选中」「deleteNodeById」实现，只是换个更快的入口。
 */
export const NodeActionContext = createContext<{
  copyNode: (id: string) => void;
  deleteNode: (id: string) => void;
}>({
  copyNode: () => {},
  deleteNode: () => {},
});
