/**
 * 飞书 App Secret 的运行时持有者（只在内存里）。
 * - 启动：从环境变量 OBLIVIONIS_FEISHU_SECRET 取——这是 Tauri 外壳从 Windows 凭据管理器读出后
 *   spawn bridge 时注入的（见 src-tauri/src/lib.rs）。命令行手动起 bridge 时也可自行设这个变量。
 * - 运行中：前端「保存并连接」会经 feishu-set 把新密钥发来，这里更新内存值（同时前端已写进凭据管理器）。
 * 绝不写进 config.json、绝不经 WS 广播——密钥的"权威存储"是 OS 凭据管理器。
 */
let secret = process.env.OBLIVIONIS_FEISHU_SECRET ?? "";

export const feishuSecret = {
  get: (): string => secret,
  set: (s: string): void => {
    secret = s;
  },
  /** 兜底：env 里没有时，用一个来源（如旧 config.json 的明文，迁移期）补上 */
  seedIfEmpty: (fallback: string | undefined): void => {
    if (!secret && fallback) secret = fallback;
  },
};
