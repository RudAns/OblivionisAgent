import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 期望前端 dev server 跑在固定端口
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  // 让 @oblivionis/shared 的 TS 源能被直接打包
  optimizeDeps: {
    include: [],
  },
});
