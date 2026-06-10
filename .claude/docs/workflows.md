# 开发/调试工作流

## 日常发布（用户在用软件时也能跑）

双击根目录 `rebuild-deploy.bat`：
1. 打包 bridge sidecar（`pnpm package`，esbuild → @yao-pkg/pkg 出 exe）
2. 构建桌面 app（`pnpm tauri build --no-bundle`）—— 这两步期间软件照常运行
3. taskkill 关闭运行中的 app/sidecar（解锁 exe）
4. 覆盖到 `..\OblivionisAgent-便携版\`（按 `OblivionisAgent-*` 通配符找，不硬编码中文路径）
5. 重新启动便携版

任一构建步失败会停下 pause，不会在没构建成功时杀进程。

## 开发模式（热重载）

```bash
cd apps/desktop && pnpm tauri dev      # 前端改动即时生效；会自动拉起 sidecar
# 想手动调引擎: set OBLIVIONIS_NO_SIDECAR=1 后 pnpm tauri dev + 另开 pnpm bridge
```

## 只验证编译（不打扰运行中的程序）

```bash
cd packages/bridge && pnpm typecheck            # 引擎 TS
cd apps/desktop && npx tsc --noEmit             # 前端 TS
cd apps/desktop && pnpm tauri build --no-bundle # 全量（产物只进 target/，不碰便携版）
```

## 引擎冒烟测试（不依赖飞书）

```bash
cd packages/bridge
npx tsx src/smoke.ts           # 单会话 stream-json 往返
npx tsx src/smoke-loop.ts      # 完整路由链路: 模拟入站→route→真 claude→断言回复
npx tsx src/smoke-fork.ts      # fork+脱敏: 验证 fork 无密、base 完好
npx tsx src/smoke-classify.ts  # 意图分类
```

## PTY 调试探针（src-tauri/examples/，调终端问题的利器）

```bash
cd apps/desktop/src-tauri
cargo run --example pty_probe    # 抓 claude 启动时的终端模式协商(bracketed paste/kitty/字符集)
cargo run --example pty_nl -- <候选>   # 实测某按键字节序是"软换行"还是"提交"
                                       # 候选: esc-cr | bp-cr | bp-lf | csi-u | lf | esccr-cr
                                       # 用 vte 重建最终屏幕来判定，输出带结论
cargo run --example pty_resume   # 验证 --resume 在 PTY 里真的回放历史
cargo run --example pty_diamond  # 扫原始字节里有没有某字符/DEC 字符集切换(查"乱码到底谁发的")
```

原则：终端显示问题**先抓原始字节**分清"claude 发的"还是"我们渲染的"，再动手。
用完记得 `rm -rf target/debug`（dev profile 产物 4GB+）。

## 升级 xterm 注意

当前锁定 beta（原因见 pitfalls.md C7）。升级时：
1. 三件套同升（xterm / addon-webgl / addon-fit 版本必须互相配对，看 peerDependencies）
2. `npx tsc --noEmit` 看 API 变更（如 customGlyphs 已移到 WebglAddon 构造参数）
3. 重点回归：中文长输出不乱码、切换终端不残影、历史回放完整

## 给会话节点接新群的标准流程

1. 画布加「飞书群」节点，填 chatId（机器人入群后从审计/未路由横幅里能拿到）
2. 加「路由」节点（可设前缀 prompt）；需要按意图分流就中间加「意图分流」节点，
   在**连线**上写意图描述（留空=默认边）
3. 加「Claude 会话」节点：填 cwd + baseSessionId（点「列出该目录的会话」选）
   - baseSessionId = 你的开发会话（终端双击看到的就是它）
   - 飞书消息自动走 fork 脱敏分身，首条访客消息触发 fork
4. 连线，自动保存即生效
