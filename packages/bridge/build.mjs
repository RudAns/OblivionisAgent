// 把 Bridge(Node/TS) 打包成单个 CJS 文件，供 pkg 编译成 sidecar exe。
// node-pty 是可选原生模块，无法静态打包 -> 标记 external（打包后的 exe 暂不支持 PTY）。
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: "dist/bridge.cjs",
  external: ["node-pty"],
  logLevel: "info",
  banner: { js: "/* OblivionisAgent bridge — bundled */" },
});

console.log("✅ bundled -> dist/bridge.cjs");
