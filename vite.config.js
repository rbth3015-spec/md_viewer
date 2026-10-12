import { defineConfig } from "vite";

// Tauri 개발 서버 설정
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022", outDir: "dist", chunkSizeWarningLimit: 2000 },
});
