import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  // React 插件：处理 JSX 自动转换 + React Fast Refresh（开发热更新）
  plugins: [react()],

  server: {
    // 开发服务器端口与原 CRA 保持一致，避免影响已配置的 CORS 白名单
    port: 3000,
    open: true,
  },

  build: {
    // 编译产物目录与原 CRA 构建路径保持一致，不影响已有的部署脚本
    outDir: "build",
    sourcemap: true,
  },
});
