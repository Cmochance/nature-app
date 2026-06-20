import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const __dirname = dirname(fileURLToPath(import.meta.url));

// 纯浏览器 dev(非 tauri dev)时,用 mock 替身替换 Tauri 原生模块,
// 这样在 http://localhost:1420 就能预览完整界面。
// tauri dev 会设置 TAURI_ENV_PLATFORM 等环境变量,据此区分两种环境。
const isBrowserOnlyDev = !process.env.TAURI_ENV_PLATFORM;

const mockAliases = isBrowserOnlyDev
  ? [
      { find: "@tauri-apps/api/core", replacement: resolve(__dirname, "src/mock/tauri-core.ts") },
      { find: "@tauri-apps/plugin-dialog", replacement: resolve(__dirname, "src/mock/dialog.ts") },
      { find: "@tauri-apps/plugin-fs", replacement: resolve(__dirname, "src/mock/fs.ts") },
      { find: "@tauri-apps/plugin-opener", replacement: resolve(__dirname, "src/mock/opener.ts") },
    ]
  : [];

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: mockAliases,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
